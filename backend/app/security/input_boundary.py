import base64
from datetime import datetime
from uuid import UUID

MAX_SOURCE_TEXT_LENGTH = 100_000


class InputBoundaryError(ValueError):
    """Raised when untrusted input cannot enter the application boundary."""


def normalize_source_text(value: str) -> str:
    if not isinstance(value, str):
        raise InputBoundaryError("source text must be a string")
    text = value.strip()
    if not text:
        raise InputBoundaryError("source text cannot be empty")
    if len(text) > MAX_SOURCE_TEXT_LENGTH:
        raise InputBoundaryError(f"source text cannot exceed {MAX_SOURCE_TEXT_LENGTH} characters")
    if "\x00" in text:
        raise InputBoundaryError("source text contains a forbidden null character")
    return text


def encode_cursor(created_at: datetime, object_id: UUID) -> str:
    raw = f"{created_at.isoformat()}|{object_id}".encode()
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_cursor(value: str) -> tuple[datetime, UUID]:
    try:
        padding = "=" * (-len(value) % 4)
        raw = base64.urlsafe_b64decode((value + padding).encode("ascii")).decode("utf-8")
        timestamp, object_id = raw.split("|", maxsplit=1)
        return datetime.fromisoformat(timestamp), UUID(object_id)
    except (ValueError, UnicodeError) as exc:
        raise InputBoundaryError("cursor is invalid") from exc


def require_source_excerpt(excerpt: str, source_text: str) -> None:
    if not excerpt.strip() or excerpt.strip() not in source_text:
        raise InputBoundaryError("every evidence excerpt must be present in source text")
