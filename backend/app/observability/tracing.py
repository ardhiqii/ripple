"""Minimal trace-span context used by the API without a vendor SDK."""

from __future__ import annotations

import logging
import time
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from uuid import uuid4

_logger = logging.getLogger("ripple.trace")
_current_span: ContextVar[TraceSpan | None] = ContextVar("ripple_current_span", default=None)
_SENSITIVE_KEYS = frozenset(
    {
        "contents",
        "prompt",
        "raw_model_payload",
        "raw_source",
        "raw_text",
        "source",
        "source_text",
        "system_prompt",
        "thought",
    }
)


def _safe_attributes(value: object) -> object:
    if isinstance(value, Mapping):
        return {
            str(key): (
                "[REDACTED]"
                if str(key).lower() in _SENSITIVE_KEYS
                else _safe_attributes(item)
            )
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [_safe_attributes(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


@dataclass(frozen=True, slots=True)
class TraceSpan:
    name: str
    trace_id: str
    span_id: str
    parent_span_id: str | None


def current_trace_id() -> str | None:
    span = _current_span.get()
    return span.trace_id if span else None


@contextmanager
def trace_span(
    name: str,
    *,
    trace_id: str | None = None,
    attributes: Mapping[str, object] | None = None,
    **fields: object,
) -> Iterator[TraceSpan]:
    parent = _current_span.get()
    span = TraceSpan(
        name=name,
        trace_id=trace_id or (parent.trace_id if parent else str(uuid4())),
        span_id=str(uuid4()),
        parent_span_id=parent.span_id if parent else None,
    )
    token = _current_span.set(span)
    safe_fields = _safe_attributes({**dict(attributes or {}), **fields})
    started = time.perf_counter()
    _logger.info(
        "trace.span.start",
        extra={
            "event": "trace.span.start",
            "trace_id": span.trace_id,
            "span_id": span.span_id,
            "parent_span_id": span.parent_span_id,
            "span_name": span.name,
            "span_attributes": safe_fields,
        },
    )
    try:
        yield span
    except Exception as exc:
        _logger.info(
            "trace.span.error",
            extra={
                "event": "trace.span.error",
                "trace_id": span.trace_id,
                "span_id": span.span_id,
                "span_name": span.name,
                "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                "error_type": type(exc).__name__,
            },
        )
        raise
    finally:
        _logger.info(
            "trace.span.end",
            extra={
                "event": "trace.span.end",
                "trace_id": span.trace_id,
                "span_id": span.span_id,
                "span_name": span.name,
                "duration_ms": round((time.perf_counter() - started) * 1000, 2),
            },
        )
        _current_span.reset(token)
