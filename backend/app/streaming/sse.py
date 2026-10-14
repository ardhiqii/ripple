import json
from datetime import UTC, datetime
from typing import Any
from uuid import UUID


def format_sse(
    *,
    run_id: UUID,
    sequence: int | None,
    event_type: str,
    timestamp: datetime,
    phase: str | None,
    public: dict[str, Any],
) -> str:
    envelope = {
        "run_id": str(run_id),
        "seq": sequence,
        "type": event_type,
        "timestamp": _timestamp(timestamp),
        "phase": phase,
        "public": public,
    }
    lines: list[str] = []
    if sequence is not None:
        lines.append(f"id: {sequence}")
    lines.append(f"event: {event_type}")
    lines.append(
        "data: "
        + json.dumps(envelope, ensure_ascii=False, separators=(",", ":"), default=str)
    )
    return "\n".join(lines) + "\n\n"


def _timestamp(value: datetime) -> str:
    if value.tzinfo is None:
        return value.isoformat() + "Z"
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")
