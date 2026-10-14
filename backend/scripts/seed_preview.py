"""Idempotently install the synthetic demo seed for a preview database."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

from app.persistence.database import create_async_engine
from sqlalchemy import text


def seed_statements() -> list[str]:
    source = (Path(__file__).parents[1] / "seed" / "offshore_a12.sql").read_text(
        encoding="utf-8"
    )
    lines = [
        line
        for line in source.splitlines()
        if not line.strip().startswith("--")
        and line.strip().upper() not in {"BEGIN;", "COMMIT;"}
    ]
    return [statement.strip() for statement in "\n".join(lines).split(";") if statement.strip()]


async def seed_preview() -> None:
    database_url = os.environ["RIPPLE_DATABASE_URL"]
    engine = create_async_engine(database_url, pool_size=1, max_overflow=0)
    try:
        async with engine.begin() as connection:
            for statement in seed_statements():
                await connection.execute(text(statement))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed_preview())
