import re
from collections.abc import Iterable

from app.application.schemas import ChangeEventExtraction, HardConstraintExtraction
from app.domain.enums import EventNature
from app.security.input_boundary import normalize_source_text

_DAY_PATTERN = re.compile(
    r"(?<![A-Za-z0-9])(?:d\s*\+\s*|day(?:\s*(?:is|at|on|=|:)\s*|\s+))(\d{1,3})(?![A-Za-z0-9])",
    re.IGNORECASE,
)
_NEGATIVE_PREFIX_PATTERN = re.compile(
    r"(?:don't|do not|never|leave|keep)\W+(?:[A-Za-z]+\W+){0,3}$",
    re.IGNORECASE,
)
_NEGATIVE_SUFFIX_PATTERN = re.compile(
    r"\W+(?:is|remains)\W+(?:locked|unchanged|untouched)\b",
    re.IGNORECASE,
)
_DISRUPTION_PATTERN = re.compile(
    r"\b(?:delay|delayed|slips?|slipped|late|dropped|finding|weather|unavailable|outage)\b",
    re.IGNORECASE,
)


def extract_synthetic_event(
    source_text: str,
    known_job_ids: Iterable[str],
) -> ChangeEventExtraction:
    """Extract only unambiguous job/day facts for the guarded preview path.

    This parser deliberately returns clarification when it cannot resolve exactly
    one known job and one relative day. It never creates IDs from source text and
    does not inspect operational tables beyond the supplied scenario job IDs.
    """

    text = normalize_source_text(source_text)
    occurrences = _job_occurrences(text, known_job_ids)
    constrained = tuple(item for item in occurrences if item[2])
    candidates = tuple(item for item in occurrences if not item[2])

    candidate_job_ids = tuple(dict.fromkeys(item[1] for item in candidates))
    job_ids: tuple[str, ...]
    if len(candidate_job_ids) == 1:
        job_ids = candidate_job_ids
    else:
        job_ids = ()

    days = tuple(sorted({match for match in _DAY_PATTERN.findall(text)}))
    requested_start = int(days[0]) if len(days) == 1 else None
    missing_info: list[str] = []
    if len(candidate_job_ids) != 1:
        missing_info.append("job_id")
    if len(days) != 1:
        missing_info.append("requested_start")

    hard_constraints = tuple(
        HardConstraintExtraction(
            kind="do_not_change",
            value=job_id,
            source_excerpt=_sentence_excerpt(text, start, end),
        )
        for start, job_id, _is_constrained, end in constrained
    )
    return ChangeEventExtraction(
        nature=(
            EventNature.DISRUPTION
            if _DISRUPTION_PATTERN.search(text)
            else EventNature.REQUEST
        ),
        cause=None,
        job_ids=job_ids,
        objective=None,
        requested_start=requested_start,
        eta_updates=(),
        hard_constraints=hard_constraints,
        soft_preferences=(),
        risk_tags=(),
        levers_ruled_out=(),
        missing_info=tuple(missing_info),
        source_excerpt=text[:5000],
    )


def _job_occurrences(
    source_text: str,
    known_job_ids: Iterable[str],
) -> tuple[tuple[int, str, bool, int], ...]:
    matches: list[tuple[int, str, bool, int]] = []
    seen: set[tuple[int, str]] = set()
    normalized_ids = {value.strip() for value in known_job_ids if value.strip()}
    for job_id in sorted(normalized_ids, key=len, reverse=True):
        pattern = re.compile(
            rf"(?<![A-Za-z0-9]){re.escape(job_id)}(?![A-Za-z0-9])",
            re.IGNORECASE,
        )
        for match in pattern.finditer(source_text):
            key = (match.start(), job_id)
            if key in seen:
                continue
            seen.add(key)
            prefix = source_text[max(0, match.start() - 48) : match.start()]
            suffix = source_text[match.end() : match.end() + 36]
            constrained = bool(
                _NEGATIVE_PREFIX_PATTERN.search(prefix)
                or _NEGATIVE_SUFFIX_PATTERN.match(suffix)
            )
            matches.append((match.start(), job_id, constrained, match.end()))
    return tuple(sorted(matches, key=lambda item: (item[0], -len(item[1]), item[1])))


def _sentence_excerpt(source_text: str, start: int, end: int) -> str:
    sentence_start = max(
        source_text.rfind(".", 0, start),
        source_text.rfind("!", 0, start),
        source_text.rfind("?", 0, start),
        source_text.rfind("\n", 0, start),
    ) + 1
    sentence_end_candidates = [
        position
        for position in (
            source_text.find(".", end),
            source_text.find("!", end),
            source_text.find("?", end),
            source_text.find("\n", end),
        )
        if position >= 0
    ]
    sentence_end = min(sentence_end_candidates, default=len(source_text))
    excerpt = source_text[sentence_start:sentence_end].strip()
    if not excerpt:
        excerpt = source_text[start:end]
    return excerpt[:5000]
