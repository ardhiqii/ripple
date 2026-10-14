import os
from typing import Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import text


class HealthResponse(BaseModel):
    status: Literal["ok", "ready"]
    service: str


class DiagnosticsResponse(BaseModel):
    status: Literal["ok", "degraded"]
    service: str
    database: dict[str, object]
    vertex_ai: dict[str, object]
    solver: dict[str, object]
    metrics: dict[str, object]


router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live", response_model=HealthResponse)
async def live(request: Request) -> HealthResponse:
    return HealthResponse(status="ok", service=request.app.title)


@router.get("/ready", response_model=HealthResponse)
async def ready(request: Request) -> HealthResponse | JSONResponse:
    engine = getattr(request.app.state, "db_engine", None)
    if engine is not None:
        try:
            async with engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
        except Exception:
            return JSONResponse(
                status_code=503,
                content={
                    "status": "not_ready",
                    "service": request.app.title,
                    "error": "database_unavailable",
                },
            )
    return HealthResponse(status="ready", service=request.app.title)


@router.get("/diagnostics", response_model=DiagnosticsResponse)
async def diagnostics(request: Request) -> DiagnosticsResponse:
    engine = getattr(request.app.state, "db_engine", None)
    database: dict[str, object] = {
        "configured": engine is not None,
        "healthy": None,
    }
    if engine is not None:
        try:
            async with engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
            pool = engine.sync_engine.pool
            database.update(
                {
                    "healthy": True,
                    "pool_size": pool.size() if hasattr(pool, "size") else None,
                    "pool_checked_out": (
                        pool.checkedout() if hasattr(pool, "checkedout") else None
                    ),
                    "pool_overflow": pool.overflow() if hasattr(pool, "overflow") else None,
                }
            )
        except Exception:
            database["healthy"] = False

    solver = _solver_self_check()
    vertex_ai: dict[str, object] = {
        "configured": bool(
            os.getenv("RIPPLE_VERTEX_PROJECT", "").strip()
            and os.getenv("RIPPLE_INTAKE_MODEL", "").strip()
        )
    }
    degraded = database["healthy"] is False or solver["status"] != "ok"
    metrics = getattr(request.app.state, "metrics", None)
    snapshot = metrics.snapshot() if metrics is not None else {}
    return DiagnosticsResponse(
        status="degraded" if degraded else "ok",
        service=request.app.title,
        database=database,
        vertex_ai=vertex_ai,
        solver=solver,
        metrics=snapshot,
    )


def _solver_self_check() -> dict[str, object]:
    try:
        from ortools.sat.python import cp_model

        model = cp_model.CpModel()
        value = model.new_int_var(0, 1, "health_check")
        model.add(value == 1)
        solver = cp_model.CpSolver()
        status = solver.solve(model)
        return {"status": "ok" if status == cp_model.OPTIMAL else "failed"}
    except Exception:
        return {"status": "failed"}
