from dataclasses import dataclass
from typing import Any
from uuid import UUID, uuid4


@dataclass(frozen=True, slots=True)
class ToolCallRecord:
    call_id: UUID
    name: str
    input: dict[str, Any]
    public_result: dict[str, Any]


@dataclass(frozen=True, slots=True)
class EvidenceClaim:
    claim_id: str
    text: str
    source_ref: str
    evidence_type: str = "tool_result"


def new_claim(
    claim_id: str, text: str, source_ref: str, *, evidence_type: str = "tool_result"
) -> EvidenceClaim:
    return EvidenceClaim(claim_id, text, source_ref, evidence_type)


def call_id() -> UUID:
    return uuid4()
