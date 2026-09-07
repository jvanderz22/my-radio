from datetime import datetime, timedelta, timezone

from app.db import connect
from app.icy import NowPlaying
from app.nowplaying import _refresh_stale


async def test_repeated_probe_failure_does_not_crash(monkeypatch):
    """Regression test: _refresh_stale's cache query must select every column
    _upsert reads off a cached row (notably consecutive_failures), or a
    station's *second* failed probe raises IndexError and 500s the endpoint.
    """
    db = await connect()
    try:
        cur = await db.execute(
            "INSERT INTO stations (name, stream_url, sort_order) VALUES (?, ?, 1)",
            ("Dead Station", "http://dead.example/stream"),
        )
        await db.commit()
        station_id = cur.lastrowid
        stations = [{"id": station_id, "stream_url": "http://dead.example/stream"}]

        async def always_fails(client, url):
            return NowPlaying(status="error", detail="connection refused")

        monkeypatch.setattr("app.nowplaying.fetch_now_playing", always_fails)

        # First failure: no prior now_playing row, so this path never crashed.
        await _refresh_stale(db, stations)
        row = await (
            await db.execute(
                "SELECT consecutive_failures FROM now_playing WHERE station_id = ?",
                (station_id,),
            )
        ).fetchone()
        assert row["consecutive_failures"] == 1

        # Force both the staleness and backoff checks open so the second call
        # is due for retry - this is the path that crashed: a cached row now
        # exists in the table.
        past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        await db.execute(
            "UPDATE now_playing SET fetched_at = ?, next_retry_at = ? WHERE station_id = ?",
            (past, past, station_id),
        )
        await db.commit()

        await _refresh_stale(db, stations)  # used to raise IndexError here

        row = await (
            await db.execute(
                "SELECT consecutive_failures FROM now_playing WHERE station_id = ?",
                (station_id,),
            )
        ).fetchone()
        assert row["consecutive_failures"] == 2
    finally:
        # station_id's now_playing row cascades on delete; keep the shared
        # test DB clean for the other test modules.
        await db.execute("DELETE FROM stations WHERE id = ?", (station_id,))
        await db.commit()
        await db.close()
