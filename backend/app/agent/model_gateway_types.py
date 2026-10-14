from collections.abc import Mapping
from dataclasses import dataclass, field

from app.application.schemas import ChangeEventExtraction
from app.security.input_boundary import normalize_source_text


@dataclass(frozen=True, slots=True)
class IntakeRequest:
    """Trusted context plus one untrusted source document for intake."""

    source_text: str
    scenario_day: int | None = None
    known_job_ids: tuple[str, ...] = ()
    known_stages_by_job: Mapping[str, tuple[str, ...]] = field(default_factory=dict)
    domain_vocabulary: Mapping[str, tuple[str, ...]] = field(default_factory=dict)
    source_metadata: Mapping[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "source_text", normalize_source_text(self.source_text))
        object.__setattr__(self, "known_job_ids", tuple(self.known_job_ids))
        object.__setattr__(self, "known_stages_by_job", dict(self.known_stages_by_job))
        object.__setattr__(self, "domain_vocabulary", dict(self.domain_vocabulary))
        object.__setattr__(self, "source_metadata", dict(self.source_metadata))


@dataclass(frozen=True, slots=True)
class IntakeResult:
    extraction: ChangeEventExtraction
    model_name: str
    prompt_version: str
    repair_attempts: int
    source_sha256: str


class ModelGatewayError(RuntimeError):
    """Safe gateway error whose message never contains prompt or source content."""

    def __init__(self, code: str, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


class ModelGatewayConfigurationError(ModelGatewayError):
    def __init__(self, message: str) -> None:
        super().__init__("gateway_configuration", message)


class ExtractionRejectedError(ModelGatewayError):
    def __init__(self, *, repair_attempts: int) -> None:
        super().__init__(
            "extraction_rejected",
            "The model output did not satisfy the strict intake contract.",
        )
        self.repair_attempts = repair_attempts
