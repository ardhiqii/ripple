import importlib
import json
import logging
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
from app.config import Settings
from app.observability.metrics import default_metrics
from app.observability.tracing import trace_span
from app.security.input_boundary import require_source_excerpt
from app.security.redaction import redacted_source_metadata, source_fingerprint
from pydantic import SecretStr, ValidationError

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
    provider_retry_attempts: int = 1
    timeout_seconds: float = 10.0

    def __post_init__(self) -> None:
        if not self.model_name.strip():
            raise ValueError("model_name is required")
        if self.temperature < 0:
            raise ValueError("temperature cannot be negative")
        if self.max_output_tokens <= 0:
            raise ValueError("max_output_tokens must be positive")
        if not 0 <= self.repair_attempt_limit <= 2:
            raise ValueError("repair_attempt_limit must be between 0 and 2")
        if not 0 <= self.provider_retry_attempts <= 2:
            raise ValueError("provider_retry_attempts must be between 0 and 2")
        if self.timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive")


@dataclass(frozen=True, slots=True)
class VertexGatewayConfig:
    project: str
    location: str
    intake: IntakeModelConfig

    @classmethod
    def from_settings(cls, settings: Settings) -> "VertexGatewayConfig":
        project = (settings.vertex_project or "").strip()
        location = settings.vertex_location.strip()
        model_name = settings.intake_model.strip()
        if not project or not model_name:
            raise ModelGatewayConfigurationError(
                "RIPPLE_VERTEX_PROJECT and RIPPLE_INTAKE_MODEL are required for Vertex."
            )
        return cls(
            project=project,
            location=location,
            intake=IntakeModelConfig(
                model_name,
                provider_retry_attempts=settings.model_retry_attempts,
                timeout_seconds=settings.model_timeout_seconds,
            ),
        )

    @classmethod
    def from_environment(cls) -> "VertexGatewayConfig":
        """Compatibility constructor that still resolves values through Settings."""

        return cls.from_settings(Settings())


@dataclass(frozen=True, slots=True)
class GeminiDeveloperGatewayConfig:
    api_key: SecretStr
    intake: IntakeModelConfig

    @classmethod
    def from_settings(cls, settings: Settings) -> "GeminiDeveloperGatewayConfig":
        api_key = settings.gemini_api_key
        model_name = settings.intake_model.strip()
        if api_key is None or not api_key.get_secret_value().strip():
            raise ModelGatewayConfigurationError(
                "RIPPLE_GEMINI_API_KEY is required for the Gemini Developer provider."
            )
        if not model_name:
            raise ModelGatewayConfigurationError(
                "RIPPLE_INTAKE_MODEL is required for the Gemini Developer provider."
            )
        return cls(
            api_key=api_key,
            intake=IntakeModelConfig(
                model_name,
                provider_retry_attempts=settings.model_retry_attempts,
                timeout_seconds=settings.model_timeout_seconds,
            ),
        )


class VertexModelGateway:
    """Vertex-backed structured intake with no domain or persistence access."""

    def __init__(
        self,
        client: StructuredModelClient,
        config: VertexGatewayConfig | GeminiDeveloperGatewayConfig,
    ) -> None:
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
                raise _provider_error(exc) from exc
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
    """Thin adapter for google-genai's async structured-content client."""

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
        raise ValueError("The model provider did not contain structured content")


def build_vertex_gateway() -> VertexModelGateway:
    """Create the production gateway lazily so startup never calls the model."""

    config = VertexGatewayConfig.from_environment()
    return _build_google_gateway(
        config=config,
        client_kwargs={
            "vertexai": True,
            "project": config.project,
            "location": config.location,
        },
    )


def build_vertex_gateway_from_settings(settings: Settings) -> VertexModelGateway:
    config = VertexGatewayConfig.from_settings(settings)
    return _build_google_gateway(
        config=config,
        client_kwargs={
            "vertexai": True,
            "project": config.project,
            "location": config.location,
        },
    )


def build_gemini_developer_gateway(settings: Settings) -> VertexModelGateway:
    config = GeminiDeveloperGatewayConfig.from_settings(settings)
    return _build_google_gateway(
        config=config,
        client_kwargs={"api_key": config.api_key.get_secret_value()},
    )


def build_configured_gateway(settings: Settings) -> ModelGateway:
    """Build only the explicitly selected live provider; synthetic is not a gateway."""

    if settings.model_provider == "gemini_developer":
        return build_gemini_developer_gateway(settings)
    if settings.model_provider == "vertex":
        return build_vertex_gateway_from_settings(settings)
    raise ModelGatewayConfigurationError(
        "The synthetic provider is deterministic and does not create a model gateway."
    )


def _build_google_gateway(
    *,
    config: VertexGatewayConfig | GeminiDeveloperGatewayConfig,
    client_kwargs: dict[str, Any],
) -> VertexModelGateway:
    try:
        genai_module = importlib.import_module("google.genai")
        types_module = importlib.import_module("google.genai.types")
    except ModuleNotFoundError as exc:
        raise ModelGatewayConfigurationError(
            "The google-genai package is required for the selected model provider."
        ) from exc
    client_factory = getattr(genai_module, "Client", None)
    if client_factory is None:
        raise ModelGatewayConfigurationError("The installed google-genai package has no Client.")
    http_options_factory = getattr(types_module, "HttpOptions", None)
    retry_options_factory = getattr(types_module, "HttpRetryOptions", None)
    http_options = None
    if http_options_factory is not None:
        retry_options = None
        if retry_options_factory is not None:
            retry_options = retry_options_factory(
                attempts=config.intake.provider_retry_attempts + 1,
                initial_delay=0.25,
                max_delay=1.0,
            )
        http_options = http_options_factory(
            timeout=int(config.intake.timeout_seconds * 1000),
            retry_options=retry_options,
        )
    if http_options is not None:
        client_kwargs["http_options"] = http_options
    client = client_factory(**client_kwargs)
    return VertexModelGateway(GoogleGenAIStructuredClient(client, types_module), config)


def _provider_error(error: Exception) -> ModelGatewayError:
    """Map SDK failures to safe, actionable categories without exposing secrets."""

    detail = str(error).lower()
    if any(token in detail for token in ("quota", "rate limit", "resource exhausted", "429")):
        return ModelGatewayError(
            "provider_quota_exceeded",
            "The configured model provider quota or rate limit was exceeded.",
            retryable=True,
        )
    if any(
        token in detail
        for token in ("api key", "permission", "unauthorized", "forbidden", "401", "403")
    ):
        return ModelGatewayError(
            "provider_auth_error",
            "The configured model provider rejected authentication or model access.",
            retryable=False,
        )
    if any(
        token in detail
        for token in ("not found", "404", "model not available", "unsupported model")
    ):
        return ModelGatewayError(
            "provider_model_unavailable",
            "The configured model is unavailable for this provider.",
            retryable=False,
        )
    return ModelGatewayError(
        "provider_error",
        "The configured model provider could not complete extraction.",
        retryable=True,
    )


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
