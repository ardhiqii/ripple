import hashlib
from collections.abc import Mapping
from typing import Any

SENSITIVE_KEYS = frozenset(
    {"raw_text", "source_text", "prompt", "contents", "invalid_candidate", "raw_output"}
)


def source_fingerprint(source_text: str) -> str:
    return hashlib.sha256(source_text.encode()).hexdigest()


def redacted_source_metadata(source_text: str) -> dict[str, Any]:
    return {"sha256": source_fingerprint(source_text), "length": len(source_text)}


def redact_mapping(value: Mapping[str, Any]) -> dict[str, Any]:
    """Redact prompt-bearing fields before diagnostics are emitted."""

    return {
        key: "[REDACTED]" if key.lower() in SENSITIVE_KEYS else item
        for key, item in value.items()
    }
