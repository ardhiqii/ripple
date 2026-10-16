from contextlib import asynccontextmanager

from app.api.middleware import RequestContextMiddleware
from app.api.routers.ask import router as ask_router
from app.api.routers.demo import router as demo_router
from app.api.routers.events import router as events_router
from app.api.routers.health import router as health_router
from app.api.routers.plans import router as plans_router
from app.api.routers.policy import router as policy_router
from app.api.routers.readiness import router as readiness_router
from app.api.routers.runs import router as runs_router
from app.api.routers.schedule import router as schedule_router
from app.application.errors import ApplicationError
from app.config import Settings, get_settings
from app.observability.logging import configure_logging
from app.observability.metrics import default_metrics
from app.persistence.database import create_async_engine, create_session_factory
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse


@asynccontextmanager
async def lifespan(application: FastAPI):
    yield
    engine = getattr(application.state, "db_engine", None)
    if engine is not None:
        await engine.dispose()


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()
    configure_logging(resolved_settings)
    application = FastAPI(
        title=resolved_settings.app_name,
        version=resolved_settings.app_version,
        lifespan=lifespan,
    )
    application.state.metrics = default_metrics()
    if resolved_settings.database_url:
        engine = create_async_engine(
            resolved_settings.database_url,
            pool_size=resolved_settings.db_pool_size,
            max_overflow=resolved_settings.db_max_overflow,
            pool_timeout=resolved_settings.db_pool_timeout_seconds,
            statement_timeout=resolved_settings.db_statement_timeout_seconds,
        )
        application.state.db_engine = engine
        application.state.session_factory = create_session_factory(engine)
    application.state.settings = resolved_settings

    @application.exception_handler(ApplicationError)
    async def application_error_handler(request: Request, error: ApplicationError) -> JSONResponse:
        context = getattr(request.state, "context", None)
        request_id = str(getattr(context, "request_id", ""))
        return JSONResponse(
            status_code=error.status_code,
            content={
                "error": {
                    "code": error.code,
                    "message": error.message,
                    "request_id": request_id,
                    "retryable": error.retryable,
                    "details": error.details,
                }
            },
        )

    if resolved_settings.cors_origins or resolved_settings.cors_origin_regex:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=resolved_settings.cors_origins,
            allow_origin_regex=resolved_settings.cors_origin_regex,
            allow_credentials=False,
            allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["*"],
        )
    application.add_middleware(RequestContextMiddleware, settings=resolved_settings)
    application.include_router(health_router, prefix="/api/v1")
    application.include_router(ask_router, prefix="/api/v1")
    application.include_router(demo_router, prefix="/api/v1")
    application.include_router(schedule_router, prefix="/api/v1")
    application.include_router(policy_router, prefix="/api/v1")
    application.include_router(readiness_router, prefix="/api/v1")
    application.include_router(events_router, prefix="/api/v1")
    application.include_router(runs_router, prefix="/api/v1")
    application.include_router(plans_router, prefix="/api/v1")
    return application


app = create_app()
