from __future__ import annotations

from pathlib import Path

import aiosqlite
from fastapi import Request

from .config import DB_PATH

_SCHEMA = (Path(__file__).resolve().parent / "schema.sql").read_text()

_PRAGMAS = (
    "PRAGMA journal_mode=WAL",     # readers don't block the metadata poller's writes
    "PRAGMA busy_timeout=5000",    # wait instead of raising "database is locked"
    "PRAGMA synchronous=NORMAL",
    "PRAGMA foreign_keys=ON",
)


async def connect() -> aiosqlite.Connection:
    """Open the SQLite database, apply pragmas, ensure the schema exists."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    for pragma in _PRAGMAS:
        await db.execute(pragma)
    await db.executescript(_SCHEMA)
    await db.commit()
    return db


def get_db(request: Request) -> aiosqlite.Connection:
    """FastAPI dependency: the process-wide connection opened in `lifespan`."""
    return request.app.state.db
