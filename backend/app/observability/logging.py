import json
import logging
import sys
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from app.config import Settings

_SENSITIVE_KEYS = frozenset(
    {
        "chain_of_thought",
        "contents",
        "credential",
        "credentials",
        "password",
        "prompt",
        "raw_model_payload",
        "raw_source",
        "raw_text",
        "secret",
        "source",
        "source_text",
        "stack_trace",
        "system_prompt",
        "thought",
        "token",
    }
)


def _redact(value: object) -> object:
    if isinstance(value, Mapping):
        return {
            str(key): "[REDACTED]"
            if str(key).lower() in _SENSITIVE_KEYS
            else _redact(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_redact(item) for item in value]
    if isinstance(value, tuple):
        return tuple(_redact(item) for item in value)
    return value


class RedactionFilter(logging.Filter):
    """Remove prompt/source-bearing values before records reach a handler."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = _redact(record.msg)
        if isinstance(record.args, tuple):
            record.args = tuple(_redact(item) for item in record.args)
        elif isinstance(record.args, Mapping):
            record.args = {str(key): _redact(item) for key, item in record.args.items()}
        for key in tuple(record.__dict__):
            if key.lower() in _SENSITIVE_KEYS:
                record.__dict__[key] = "[REDACTED]"
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for field in (
            "request_id",
            "correlation_id",
            "trace_id",
            "span_id",
            "parent_span_id",
            "span_name",
            "event",
            "scenario_id",
            "actor_id",
            "method",
            "path",
            "status_code",
            "duration_ms",
            "error_code",
            "error_type",
            "span_attributes",
        ):
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = _redact(value)
        exc_info = record.exc_info
        if exc_info and exc_info[0] is not None:
            payload["exception_type"] = exc_info[0].__name__
        return json.dumps(payload, separators=(",", ":"))


def configure_logging(settings: Settings) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(RedactionFilter())
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(settings.log_level)
