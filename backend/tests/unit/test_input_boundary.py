from datetime import datetime
from uuid import UUID

import pytest
from app.security.input_boundary import (
    InputBoundaryError,
    decode_cursor,
    encode_cursor,
    normalize_source_text,
    require_source_excerpt,
)


def test_source_text_is_trimmed_and_rejects_empty_or_null() -> None:
    assert normalize_source_text("  vendor update  ") == "vendor update"
    with pytest.raises(InputBoundaryError):
        normalize_source_text("   ")
    with pytest.raises(InputBoundaryError):
        normalize_source_text("vendor\x00update")


def test_cursor_round_trip_is_stable() -> None:
    created_at = datetime(2026, 10, 13, 12, 30, 45)
    object_id = UUID("11111111-1111-1111-1111-111111111111")

    encoded = encode_cursor(created_at, object_id)

    assert decode_cursor(encoded) == (created_at, object_id)


def test_cursor_and_evidence_are_rejected_when_invalid() -> None:
    with pytest.raises(InputBoundaryError):
        decode_cursor("not-a-cursor")
    with pytest.raises(InputBoundaryError):
        require_source_excerpt("not present", "source text")
