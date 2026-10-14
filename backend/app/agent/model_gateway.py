import importlib
import json
import logging
import os
import time
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Protocol, cast

from app.agent.model_gateway_types import (
    ExtractionRejectedError,
    IntakeRequest,
    IntakeResult,
    ModelGatewayConfigurationError,
    ModelGatewayError,
)
from app.agent.prompts.intake import (
    build_intake_prompt,
    build_repair_prompt,
    intake_prompt_version,
)
from app.application.schemas import ChangeEventExtraction
from app.observability.metrics import default_metrics
from app.observability.tracing import trace_span
from app.security.input_boundary import require_source_excerpt
from app.security.redaction import redacted_source_metadata, source_fingerprint
from pydantic import ValidationError

logger = logging.getLogger("ripple.model_gateway")


class StructuredModelClient(Protocol):
    async def generate(
        self,
        *,
        prompt: str,
        model_name: str,
        temperature: float,
        max_output_tokens: int,
        response_schema: Mapping[str, Any],
    ) -> Any: ...


class ModelGateway(Protocol):
    async def extract_change(self, request: IntakeRequest) -> IntakeResult: ...


@dataclass(frozen=True, slots=True)
class IntakeModelConfig:
    model_name: str
    temperature: float = 0.0
    max_output_tokens: int = 2000
    repair_attempt_limit: int = 2

    def __post_init__(self) -> None:
        if not self.model_name.strip():
            raise ValueError("model_name is required")
        if self.temperature < 0:
            raise ValueError("temperature cannot be negative")
        if self.max_output_tokens <= 0:
            raise ValueError("max_output_tokens must be positive")
        if not 0 <= self.repair_attempt_limit <= 2:
            raise ValueError("repair_attempt_limit must be between 0 and 2")


@dataclass(frozen=True, slots=True)
class VertexGatewayConfig:
    project: str
    location: str
    intake: IntakeModelConfig

    @classmethod
    def from_environment(cls) -> "VertexGatewayConfig":
        project = os.getenv("RIPPLE_VERTEX_PROJECT", "").strip()
        location = os.getenv("RIPPLE_VERTEX_LOCATION", "us-central1").strip()
        model_name = os.getenv("RIPPLE_INTAKE_MODEL", "").strip()
        if not project or not model_name:
            raise ModelGatewayConfigurationError(
                "RIPPLE_VERTEX_PROJECT and RIPPLE_INTAKE_MODEL are required for Vertex."
            )
        return cls(project=project, location=location, intake=IntakeModelConfig(model_name))


class VertexModelGateway:
    """Vertex-backed structured intake with no domain or persistence access."""

    def __init__(self, client: StructuredModelClient, config: VertexGatewayConfig) -> None:
        self._client = client
        self._config = config

    async def extract_change(self, request: IntakeRequest) -> IntakeResult:
        prompt = build_intake_prompt(request)
        payload: Any = None
        repair_attempts = 0
        issues: tuple[str, ...] = ()
        for attempt in range(self._config.intake.repair_attempt_limit + 1):
            if attempt == 0:
                candidate_prompt = prompt
            else:
                repair_attempts += 1
                candidate_prompt = build_repair_prompt(request, payload, issues)
            started = time.perf_counter()
            try:
                with trace_span(
                    "model.intake",
                    model_name=self._config.intake.model_name,
                    attempt=attempt,
                    repair=attempt > 0,
                ):
                    payload = await self._client.generate(
                        prompt=candidate_prompt,
                        model_name=self._config.intake.model_name,
                        temperature=self._config.intake.temperature,
                        max_output_tokens=self._config.intake.max_output_tokens,
                        response_schema=ChangeEventExtraction.model_json_schema(),
                    )
            except Exception as exc:
                default_metrics().increment("agent.model.error.count")
                default_metrics().observe_duration(
                    "agent.model.duration_ms", (time.perf_counter() - started) * 1000
                )
                raise ModelGatewayError(
                    "provider_error",
                    "The model provider did not return a structured response.",
                    retryable=True,
                ) from exc
            try:
                extraction = _validate_candidate(payload, request)
            except (ValidationError, ValueError) as exc:
                default_metrics().increment("agent.intake.schema_failure.count")
                issues = _validation_issue_codes(exc)
                continue
            default_metrics().increment("agent.model.call.count")
            default_metrics().observe_duration(
                "agent.model.duration_ms", (time.perf_counter() - started) * 1000
            )
            default_metrics().increment("agent.model.retry.count", repair_attempts)
            source_metadata = redacted_source_metadata(request.source_text)
            logger.info(
                "intake.completed",
                extra={
                    "model_name": self._config.intake.model_name,
                    "prompt_version": intake_prompt_version(),
                    "repair_attempts": repair_attempts,
                    "source_sha256": source_metadata["sha256"],
                    "source_length": source_metadata["length"],
                },
            )
            return IntakeResult(
                extraction=extraction,
                model_name=self._config.intake.model_name,
                prompt_version=intake_prompt_version(),
                repair_attempts=repair_attempts,
                source_sha256=source_fingerprint(request.source_text),
            )
        raise ExtractionRejectedError(repair_attempts=repair_attempts)


class GoogleGenAIStructuredClient:
    """Thin adapter for google-genai's Vertex async client."""

    def __init__(self, client: Any, types_module: Any) -> None:
        self._client = client
        self._types = types_module

    async def generate(
        self,
        *,
        prompt: str,
        model_name: str,
        temperature: float,
        max_output_tokens: int,
        response_schema: Mapping[str, Any],
    ) -> Any:
        config = self._types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            response_mime_type="application/json",
            response_schema=dict(response_schema),
        )
        response = await self._client.aio.models.generate_content(
            model=model_name,
            contents=prompt,
            config=config,
        )
        parsed = getattr(response, "parsed", None)
        if parsed is not None:
            return parsed
        text = getattr(response, "text", None)
        if isinstance(text, str):
            return text
        raise ValueError("Vertex response did not contain structured content")


def build_vertex_gateway() -> VertexModelGateway:
    """Create the production gateway lazily so tests do not need cloud SDKs."""

    config = VertexGatewayConfig.from_environment()
    try:
        genai_module = importlib.import_module("google.genai")
        types_module = importlib.import_module("google.genai.types")
    except ModuleNotFoundError as exc:
        raise ModelGatewayConfigurationError(
            "The google-genai package is required for Vertex model execution."
        ) from exc
    client_factory = getattr(genai_module, "Client", None)
    if client_factory is None:
        raise ModelGatewayConfigurationError("The installed google-genai package has no Client.")
    client = client_factory(
        vertexai=True,
        project=config.project,
        location=config.location,
    )
    return VertexModelGateway(GoogleGenAIStructuredClient(client, types_module), config)


def _validate_candidate(payload: Any, request: IntakeRequest) -> ChangeEventExtraction:
    candidate = _coerce_payload(payload)
    extraction = ChangeEventExtraction.model_validate(candidate)
    _validate_source_excerpts(extraction, request.source_text)
    _validate_known_ids(extraction, request)
    return extraction


def _coerce_payload(payload: Any) -> Mapping[str, Any]:
    if isinstance(payload, ChangeEventExtraction):
        return cast(Mapping[str, Any], payload.model_dump(mode="json"))
    if isinstance(payload, Mapping):
        return payload
    if isinstance(payload, str):
        parsed = json.loads(payload)
        if isinstance(parsed, Mapping):
            return parsed
    parsed = getattr(payload, "model_dump", None)
    if callable(parsed):
        dumped = parsed(mode="json")
        if isinstance(dumped, Mapping):
            return dumped
    raise ValueError("structured response must be a JSON object")


def _validate_source_excerpts(extraction: ChangeEventExtraction, source_text: str) -> None:
    require_source_excerpt(extraction.source_excerpt, source_text)
    for item in extraction.hard_constraints:
        require_source_excerpt(item.source_excerpt, source_text)
    for item in extraction.eta_updates:
        require_source_excerpt(item.source_excerpt, source_text)
    for item in extraction.risk_tags:
        require_source_excerpt(item.source_excerpt, source_text)
    for item in extraction.levers_ruled_out:
        require_source_excerpt(item.source_excerpt, source_text)


def _validate_known_ids(extraction: ChangeEventExtraction, request: IntakeRequest) -> None:
    if not request.known_job_ids:
        return
    known = set(request.known_job_ids)
    referenced = set(extraction.job_ids) | {item.job_id for item in extraction.eta_updates}
    unknown = referenced - known
    if unknown:
        raise ValueError("extraction references an unknown job id")


def _validation_issue_codes(error: ValidationError | ValueError) -> tuple[str, ...]:
    if isinstance(error, ValidationError):
        return tuple(
            f"{'.'.join(str(part) for part in item['loc'])}:{item['type']}"
            for item in error.errors(include_url=False, include_context=False)
        )
    return (type(error).__name__,)
