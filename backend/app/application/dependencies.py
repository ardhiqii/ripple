from collections.abc import AsyncIterator, Callable
from typing import cast

from app.application.errors import ApplicationError
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession


def get_session_factory(request: Request) -> Callable[[], AsyncSession]:
    factory = getattr(request.app.state, "session_factory", None)
    if factory is None or not callable(factory):
        raise ApplicationError(
            503,
            "database_unavailable",
            "Database access is not configured for this API process.",
            retryable=True,
        )
    return cast(Callable[[], AsyncSession], factory)


async def get_db_session(request: Request) -> AsyncIterator[AsyncSession]:
    """Yield the app-owned session; do not create a database connection per query."""

    async with get_session_factory(request)() as session:
        yield session


def scenario_id_from_request(request: Request) -> str:
    context = getattr(request.state, "context", None)
    scenario_id = getattr(context, "scenario_id", None)
    if not isinstance(scenario_id, str) or not scenario_id.strip():
        raise ApplicationError(400, "validation_error", "A scenario context is required.")
    return scenario_id


def require_capability(request: Request, capability: str) -> None:
    context = getattr(request.state, "context", None)
    capabilities = getattr(context, "capabilities", set())
    if capability not in capabilities:
        raise ApplicationError(
            403,
            "policy_violation",
            "The current actor is not allowed to perform this action.",
            details={"required_capability": capability},
        )
