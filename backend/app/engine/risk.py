from collections.abc import Sequence
from dataclasses import dataclass

from app.domain.changes import RiskEvidence
from app.domain.enums import Confidence, RiskTag
from app.domain.policy import DomainPack

LOW_CONFIDENCE_BUFFER_DAYS = 1


@dataclass(frozen=True, slots=True)
class RiskEvaluation:
    risk_buffer_days: int
    confidence: Confidence
    plan_on_latest: bool
    vendor_expedite_required: bool
    locks_job: bool
    notes: tuple[str, ...]
    matched_tags: tuple[RiskTag, ...]


def evaluate_risk_tags(
    base_confidence: Confidence,
    risk_tags: Sequence[RiskEvidence | str],
    pack: DomainPack,
    *,
    target_ids: frozenset[str] | None = None,
) -> RiskEvaluation:
    """Apply fixed domain effects to model-provided risk tags."""

    buffer_days = 0
    confidence = base_confidence
    plan_on_latest = False
    vendor_expedite_required = False
    locks_job = False
    notes: list[str] = []
    matched_tags: list[RiskTag] = []

    for evidence in risk_tags:
        if isinstance(evidence, RiskEvidence):
            raw_tag = evidence.tag.value
            source = evidence.source_sentence
            object_id = evidence.object_id
        else:
            raw_tag = evidence
            source = ""
            object_id = None
        if target_ids is not None and object_id is not None and object_id not in target_ids:
            continue

        try:
            tag = RiskTag(raw_tag)
        except ValueError:
            notes.append(f"Unknown risk tag '{raw_tag}' has no schedule effect")
            continue

        effect = pack.risk_rule(tag).effect
        matched_tags.append(tag)
        buffer_days += effect.buffer_days
        if effect.confidence is Confidence.LOW:
            confidence = Confidence.LOW
        plan_on_latest = plan_on_latest or effect.plan_on_latest
        vendor_expedite_required = vendor_expedite_required or effect.requires_vendor_expedite
        locks_job = locks_job or effect.locks_job
        if tag is RiskTag.OTHER:
            detail = f": {source}" if source else ""
            notes.append(f"Risk tag 'other' has no schedule effect{detail}")

    return RiskEvaluation(
        risk_buffer_days=buffer_days,
        confidence=confidence,
        plan_on_latest=plan_on_latest,
        vendor_expedite_required=vendor_expedite_required,
        locks_job=locks_job,
        notes=tuple(notes),
        matched_tags=tuple(matched_tags),
    )
