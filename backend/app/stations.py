from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from .db import get_db
from .models import StationCreate, StationUpdate

router = APIRouter(prefix="/api/stations", tags=["stations"])

_SELECT = """
    SELECT s.id, s.name, s.stream_url, s.homepage_url, s.favicon_url,
           s.codec, s.bitrate, s.sort_order,
           np.status           AS np_status,
           np.raw_stream_title AS np_raw,
           np.fetched_at       AS np_fetched_at
    FROM stations s
    LEFT JOIN now_playing np ON np.station_id = s.id
"""


async def _get_one(db, station_id: int) -> dict:
    cur = await db.execute(_SELECT + " WHERE s.id = ?", (station_id,))
    row = await cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="station not found")
    return dict(row)


@router.get("")
async def list_stations(request: Request):
    db = get_db(request)
    cur = await db.execute(_SELECT + " ORDER BY s.sort_order, s.id")
    return [dict(row) for row in await cur.fetchall()]


@router.post("", status_code=201)
async def create_station(request: Request, body: StationCreate):
    db = get_db(request)
    cur = await db.execute("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM stations")
    next_order = (await cur.fetchone())[0]
    cur = await db.execute(
        """
        INSERT INTO stations
            (name, stream_url, homepage_url, favicon_url, codec, bitrate,
             radio_browser_uuid, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            body.name,
            body.stream_url,
            body.homepage_url,
            body.favicon_url,
            body.codec,
            body.bitrate,
            body.radio_browser_uuid,
            next_order,
        ),
    )
    await db.commit()
    return await _get_one(db, cur.lastrowid)


@router.patch("/{station_id}")
async def update_station(request: Request, station_id: int, body: StationUpdate):
    db = get_db(request)
    fields = body.model_dump(exclude_unset=True)
    if fields:
        assignments = ", ".join(f"{col} = ?" for col in fields)  # keys are fixed model fields
        await db.execute(
            f"UPDATE stations SET {assignments} WHERE id = ?",
            (*fields.values(), station_id),
        )
        await db.commit()
    return await _get_one(db, station_id)


@router.delete("/{station_id}", status_code=204)
async def delete_station(request: Request, station_id: int):
    db = get_db(request)
    cur = await db.execute("DELETE FROM stations WHERE id = ?", (station_id,))
    await db.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="station not found")
