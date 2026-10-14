"""Bounded execution boundary for synchronous CP-SAT solves."""

from __future__ import annotations

import asyncio
import os
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError

from app.observability.metrics import default_metrics
from app.observability.tracing import trace_span
from app.solver.cpsat import _fingerprint, solve
from app.solver.types import SolverDiagnostics, SolveRequest, SolveResult, SolverRunStatus


class BoundedSolverWorker:
    """Run one fresh solve at a time without blocking an async event loop."""

    def __init__(self, *, max_workers: int | None = None) -> None:
        if max_workers is None:
            try:
                max_workers = int(os.getenv("RIPPLE_SOLVER_MAX_WORKERS", "1"))
            except ValueError:
                max_workers = 1
        if max_workers < 1:
            raise ValueError("max_workers must be positive")
        self._executor = ThreadPoolExecutor(
            max_workers=max_workers,
            thread_name_prefix="ripple-cpsat",
        )

    def solve(self, request: SolveRequest) -> SolveResult:
        future = self._executor.submit(solve, request)
        timeout = max(request.time_limit_seconds + 0.5, 0.5)
        try:
            return future.result(timeout=timeout)
        except FutureTimeoutError:
            future.cancel()
            profile = request.profile
            diagnostics = SolverDiagnostics(
                status=SolverRunStatus.UNKNOWN,
                wall_time_ms=int(timeout * 1000),
                objective_value=None,
                best_bound=None,
                model_fingerprint=_fingerprint(request),
                profile_name=profile.name,
                weights={
                    "delay_weight": profile.delay_weight,
                    "lever_cost_weight": profile.lever_cost_weight,
                    "movement_weight": profile.movement_weight,
                    "risk_weight": profile.risk_weight,
                },
                random_seed=request.random_seed,
                num_workers=request.num_workers,
                error="bounded solver worker timed out",
            )
            return SolveResult(SolverRunStatus.UNKNOWN, False, None, (), (), diagnostics)

    async def solve_async(self, request: SolveRequest) -> SolveResult:
        loop = asyncio.get_running_loop()
        started = time.perf_counter()
        with trace_span(
            "solver.solve",
            profile=request.profile.name,
            time_limit_seconds=request.time_limit_seconds,
        ):
            result = await loop.run_in_executor(self._executor, solve, request)
        default_metrics().increment(
            "solver.run.count", labels={"status": result.status.value}
        )
        default_metrics().observe_duration(
            "solver.run.duration_ms", (time.perf_counter() - started) * 1000
        )
        if result.status.value == "infeasible":
            default_metrics().increment("solver.infeasible.count")
        if result.status.value == "model_invalid":
            default_metrics().increment("solver.model_invalid.count")
        return result

    def close(self) -> None:
        self._executor.shutdown(wait=True, cancel_futures=True)

    def __enter__(self) -> BoundedSolverWorker:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()
