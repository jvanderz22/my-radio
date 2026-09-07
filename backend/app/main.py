from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from . import db as db_module
from .config import FRONTEND_DIST
from .stations import router as stations_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db = await db_module.connect()
    try:
        yield
    finally:
        await app.state.db.close()


app = FastAPI(title="my-radio", version="0.1.0", lifespan=lifespan)
app.include_router(stations_router)


@app.get("/healthz")
async def healthz():
    return {"ok": True}


# --- static SPA (built frontend); absent during API-only local dev ---
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="static")
else:

    @app.get("/")
    async def _no_frontend():
        return {
            "ok": True,
            "note": (
                "Frontend not built. Run `npm --prefix frontend run dev` for the UI "
                "(proxied to this server), or `npm --prefix frontend run build` to bundle it."
            ),
        }
