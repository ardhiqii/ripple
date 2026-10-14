import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any


@dataclass(frozen=True, slots=True)
class NumericClaim:
    field: str
    value: Any
    evidence_ref: str


@dataclass(frozen=True, slots=True)
class ExplanationDraft:
    planner: str
    management: str
    logistics: str
    claims: tuple[NumericClaim, ...] = ()


@dataclass(frozen=True, slots=True)
class NumericCheckResult:
    valid: bool
    mismatches: tuple[str, ...]


_NUMBER = re.compile(r"(?<![A-Za-z0-9-])(?:D\+)?-?\d+(?:\.\d+)?")


class NumericChecker:
    """Compare model-supplied numeric claims with engine-authoritative values."""

    def check(
        self, draft: ExplanationDraft, authoritative: dict[str, Any]
    ) -> NumericCheckResult:
        mismatches: list[str] = []
        expected_numbers = {
            number
            for value in authoritative.values()
            if (number := _number(value)) is not None
        }
        for claim in draft.claims:
            if not claim.evidence_ref:
                mismatches.append(f"{claim.field}:missing_evidence")
                continue
            if claim.field not in authoritative:
                mismatches.append(f"{claim.field}:unknown_field")
                continue
            actual = _number(claim.value)
            expected = _number(authoritative[claim.field])
            if actual is None or expected is None or actual != expected:
                mismatches.append(f"{claim.field}:value_mismatch")
        for text in (draft.planner, draft.management, draft.logistics):
            for token in _NUMBER.findall(text):
                value = _number(token.removeprefix("D+"))
                if value is not None and value not in expected_numbers:
                    mismatches.append(f"prose:{token}:value_mismatch")
        return NumericCheckResult(not mismatches, tuple(mismatches))


def _number(value: Any) -> Decimal | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
