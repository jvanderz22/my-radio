"""On-demand now-playing cache.

`GET /api/now-playing` refreshes only the stations whose cached title is stale
(or has never been fetched, and isn't in a backoff window), probes them
concurrently, writes the results to the `now_playing` table, and returns the
whole cache. No background worker — the work happens while the request is in
flight, which suits Fly's auto-stop machines.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Request

from .config import (
    NOWPLAYING_MAX_CONCURRENCY,
    NOWPLAYING_NO_METADATA_TTL,
    NOWPLAYING_STALE_SECONDS,
    STREAM_USER_AGENT,
)
from .db import get_db
from .icy import NowPlaying, fetch_now_playing

router = APIRouter(prefix="/api", tags=["now-playing"])

_MAX_BACKOFF = timedelta(minutes=30)


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@router.get("/now-playing")
async def now_playing(request: Request, refresh: bool = True):
    db = get_db(request)
    stations = [
        dict(row)
        for row in await (await db.execute("SELECT id, stream_url FROM stations")).fetchall()
    ]
    if refresh and stations:
        await _refresh_stale(db, stations)

    cur = await db.execute(
        """
        SELECT station_id, status, artist, title, raw_stream_title AS raw,
               fetched_at, consecutive_failures
        FROM now_playing
        """
    )
    return [dict(row) for row in await cur.fetchall()]


async def _refresh_stale(db, stations: list[dict]) -> None:
    now = datetime.now(timezone.utc)
    cache = {
        row["station_id"]: row
        for row in await (
            await db.execute(
                "SELECT station_id, status, fetched_at, next_retry_at FROM now_playing"
            )
        ).fetchall()
    }

    due: list[tuple[int, str]] = []
    for station in stations:
        cached = cache.get(station["id"])
        if cached is None:
            due.append((station["id"], station["stream_url"]))
            continue
        next_retry = _parse_dt(cached["next_retry_at"])
        if next_retry and now < next_retry:
            continue
        fetched_at = _parse_dt(cached["fetched_at"])
        if fetched_at is None or (now - fetched_at).total_seconds() >= NOWPLAYING_STALE_SECONDS:
            due.append((station["id"], station["stream_url"]))

    if not due:
        return

    semaphore = asyncio.Semaphore(NOWPLAYING_MAX_CONCURRENCY)
    async with httpx.AsyncClient(
        follow_redirects=True, headers={"User-Agent": STREAM_USER_AGENT}
    ) as client:

        async def probe(station_id: int, url: str) -> tuple[int, NowPlaying]:
            async with semaphore:
                try:
                    return station_id, await fetch_now_playing(client, url)
                except Exception as exc:  # noqa: BLE001 - never let one station break the batch
                    return station_id, NowPlaying(status="error", detail=repr(exc)[:500])

        results = await asyncio.gather(*(probe(sid, url) for sid, url in due))

    for station_id, result in results:
        await _upsert(db, station_id, result, now, cache.get(station_id))
    await db.commit()


async def _upsert(db, station_id: int, np: NowPlaying, now: datetime, cached) -> None:
    iso = now.isoformat()

    if np.status == "ok":
        await db.execute(
            """
            INSERT INTO now_playing
                (station_id, raw_stream_title, artist, title, status,
                 fetched_at, consecutive_failures, next_retry_at)
            VALUES (?, ?, ?, ?, 'ok', ?, 0, NULL)
            ON CONFLICT(station_id) DO UPDATE SET
                raw_stream_title = excluded.raw_stream_title,
                artist = excluded.artist,
                title = excluded.title,
                status = 'ok',
                fetched_at = excluded.fetched_at,
                consecutive_failures = 0,
                next_retry_at = NULL
            """,
            (station_id, np.raw, np.artist, np.title, iso),
        )
        return

    if np.status == "no_metadata":
        # Station reachable but silent: cache the fact, re-probe only occasionally.
        retry_at = (now + timedelta(seconds=NOWPLAYING_NO_METADATA_TTL)).isoformat()
        await db.execute(
            """
            INSERT INTO now_playing
                (station_id, status, fetched_at, consecutive_failures, next_retry_at)
            VALUES (?, 'no_metadata', ?, 0, ?)
            ON CONFLICT(station_id) DO UPDATE SET
                status = 'no_metadata',
                fetched_at = excluded.fetched_at,
                consecutive_failures = 0,
                next_retry_at = excluded.next_retry_at
            """,
            (station_id, iso, retry_at),
        )
        return

    # status == "error": exponential backoff, keep any last-known title in place.
    failures = ((cached["consecutive_failures"] if cached else 0) or 0) + 1
    delay = min(timedelta(seconds=30 * 2 ** (failures - 1)), _MAX_BACKOFF)
    retry_at = (now + delay).isoformat()
    await db.execute(
        """
        INSERT INTO now_playing
            (station_id, status, fetched_at, consecutive_failures, next_retry_at)
        VALUES (?, 'error', ?, ?, ?)
        ON CONFLICT(station_id) DO UPDATE SET
            status = 'error',
            fetched_at = excluded.fetched_at,
            consecutive_failures = excluded.consecutive_failures,
            next_retry_at = excluded.next_retry_at
        """,
        (station_id, iso, failures, retry_at),
    )
