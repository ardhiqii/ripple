"""Unit-of-work boundary for persistence transactions."""

from collections.abc import Callable
from types import TracebackType
from typing import Protocol, Self

from sqlalchemy.ext.asyncio import AsyncSession


class UnitOfWork(Protocol):
    """Minimal transaction contract consumed by application services."""

    session: AsyncSession

    async def __aenter__(self) -> Self: ...

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> None: ...


class SqlAlchemyUnitOfWork:
    """Begin, commit/rollback, and close one async SQLAlchemy session."""

    def __init__(self, session_factory: Callable[[], AsyncSession]) -> None:
        self._session_factory = session_factory
        self.session: AsyncSession

    async def __aenter__(self) -> Self:
        self.session = self._session_factory()
        self.session.begin()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        if exc_type is None:
            await self.session.commit()
        else:
            await self.session.rollback()
        await self.session.close()
