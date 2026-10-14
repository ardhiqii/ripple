import hashlib
import logging
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from app.config import Settings
from app.observability.metrics import MetricsRegistry, default_metrics
from app.observability.tracing import trace_span
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint


@dataclass(frozen=True)
class RequestContext:
    request_id: UUID
    correlation_id: UUID
    trace_id: UUID
    actor_id: str
    scenario_id: str
    capabilities: set[str]
    received_at: datetime


def _parse_uuid(value: str | None, fallback: UUID) -> UUID:
    if not value:
        return fallback
    try:
        return UUID(value)
    except ValueError:
        return fallback


class RequestContextMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: Any, settings: Settings) -> None:
        super().__init__(app)
        self.settings = settings
        self.logger = logging.getLogger("ripple.request")

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        request_id = _parse_uuid(request.headers.get("X-Request-ID"), uuid4())
        correlation_id = _parse_uuid(request.headers.get("X-Correlation-ID"), request_id)
        trace_id = _parse_uuid(request.headers.get("X-Trace-ID"), correlation_id)
        received_at = datetime.now(UTC)
        actor_id = request.headers.get("X-Actor-ID", self.settings.demo_actor_id)
        scenario_id = request.headers.get("X-Scenario-ID", self.settings.demo_scenario_id)
        capabilities = set(self.settings.demo_capabilities)
        request.state.context = RequestContext(
            request_id=request_id,
            correlation_id=correlation_id,
            trace_id=trace_id,
            actor_id=actor_id,
            scenario_id=scenario_id,
            capabilities=capabilities,
            received_at=received_at,
        )

        content_length = request.headers.get("content-length")
        try:
            request_size = int(content_length) if content_length else 0
        except ValueError:
            request_size = 0
        metrics = getattr(request.app.state, "metrics", default_metrics())
        if not isinstance(metrics, MetricsRegistry):
            metrics = default_metrics()
        started = time.perf_counter()
        status_code = 500
        try:
            if request_size > self.settings.request_size_limit_bytes:
                response = Response(status_code=413, content="Request body is too large")
            else:
                with trace_span(
                    "HTTP request",
                    trace_id=str(trace_id),
                    method=request.method,
                    path=request.url.path,
                ):
                    response = await call_next(request)
            status_code = response.status_code
        finally:
            elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
            metrics.increment(
                "api.request.count",
                labels={"method": request.method, "route": request.url.path},
            )
            metrics.observe_duration(
                "api.request.duration_ms",
                elapsed_ms,
                labels={"method": request.method, "route": request.url.path},
            )
            if status_code >= 500:
                metrics.increment(
                    "api.request.error.count",
                    labels={"method": request.method, "route": request.url.path},
                )
            self.logger.info(
                "request.complete",
                extra={
                    "event": "request.complete",
                    "request_id": str(request_id),
                    "correlation_id": str(correlation_id),
                    "trace_id": str(trace_id),
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": status_code,
                    "duration_ms": elapsed_ms,
                    "scenario_id": scenario_id,
                    "actor_id": hashlib.sha256(actor_id.encode()).hexdigest()[:16],
                },
            )

        response.headers["X-Request-ID"] = str(request_id)
        response.headers["X-Trace-ID"] = str(trace_id)
        return response
