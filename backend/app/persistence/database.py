"""Async SQLAlchemy database configuration.

The database URL is kept at the persistence boundary so domain and engine
modules do not need to know about SQLAlchemy or FastAPI configuration.
"""

from collections.abc import Callable
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
)
from sqlalchemy.ext.asyncio import (
    create_async_engine as _create_async_engine,
)


def normalize_database_url(database_url: str) -> str:
    """Return a Supabase-compatible SQLAlchemy asyncpg PostgreSQL URL."""

    normalized = database_url
    if normalized.startswith("postgresql://"):
        normalized = normalized.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif normalized.startswith("postgres://"):
        normalized = normalized.replace("postgres://", "postgresql+asyncpg://", 1)

    if not normalized.startswith("postgresql+asyncpg://"):
        return normalized

    parts = urlsplit(normalized)
    query = [("ssl" if key == "sslmode" else key, value) for key, value in parse_qsl(parts.query)]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def create_async_engine(
    database_url: str,
    *,
    echo: bool = False,
    pool_size: int = 5,
    max_overflow: int = 3,
    pool_timeout: float = 3.0,
    statement_timeout: float = 3.0,
) -> AsyncEngine:
    """Create the application's async engine from a PostgreSQL URL."""

    connect_args: dict[str, Any] = {
        "server_settings": {"statement_timeout": str(int(statement_timeout * 1000))}
    }
    return _create_async_engine(
        normalize_database_url(database_url),
        echo=echo,
        pool_pre_ping=True,
        pool_size=pool_size,
        max_overflow=max_overflow,
        pool_timeout=pool_timeout,
        connect_args=connect_args,
    )


def create_session_factory(
    engine: AsyncEngine,
) -> async_sessionmaker[AsyncSession]:
    """Create the shared async session factory."""

    return async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


SessionFactory = Callable[[], AsyncSession]
