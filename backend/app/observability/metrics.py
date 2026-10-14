"""Small in-process metrics registry for the single Cloud Run service."""

from __future__ import annotations

from collections.abc import AsyncIterator, Mapping
from threading import Lock
from typing import Any

from app.observability.tracing import trace_span


def _metric_key(name: str, labels: Mapping[str, object] | None) -> str:
    if not labels:
        return name
    suffix = ",".join(f"{key}={labels[key]}" for key in sorted(labels))
    return f"{name}{{{suffix}}}"


class MetricsRegistry:
    """Bounded, dependency-free counters and latency summaries."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._counters: dict[str, int] = {}
        self._durations: dict[str, dict[str, float | int]] = {}
        self._active_sse = 0

    def increment(
        self, name: str, amount: int = 1, *, labels: Mapping[str, object] | None = None
    ) -> None:
        key = _metric_key(name, labels)
        with self._lock:
            self._counters[key] = self._counters.get(key, 0) + amount

    def observe_duration(
        self, name: str, duration_ms: float, *, labels: Mapping[str, object] | None = None
    ) -> None:
        key = _metric_key(name, labels)
        with self._lock:
            summary = self._durations.setdefault(
                key, {"count": 0, "sum_ms": 0.0, "max_ms": 0.0}
            )
            summary["count"] = int(summary["count"]) + 1
            summary["sum_ms"] = float(summary["sum_ms"]) + duration_ms
            summary["max_ms"] = max(float(summary["max_ms"]), duration_ms)

    def set_active_sse(self, delta: int) -> int:
        with self._lock:
            self._active_sse = max(0, self._active_sse + delta)
            return self._active_sse

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "counters": dict(self._counters),
                "durations": {key: dict(value) for key, value in self._durations.items()},
                "gauges": {"sse.active_connections": self._active_sse},
            }


_DEFAULT_REGISTRY = MetricsRegistry()


def default_metrics() -> MetricsRegistry:
    return _DEFAULT_REGISTRY


async def instrument_stream(
    stream: AsyncIterator[str],
    *,
    registry: MetricsRegistry,
    span_name: str,
    labels: Mapping[str, object] | None = None,
) -> AsyncIterator[str]:
    """Track an SSE connection without buffering or exposing its payload."""

    registry.set_active_sse(1)
    registry.increment("sse.connection.started", labels=labels)
    try:
        with trace_span(span_name, attributes=labels):
            async for frame in stream:
                yield frame
    finally:
        registry.set_active_sse(-1)
        registry.increment("sse.connection.closed", labels=labels)
