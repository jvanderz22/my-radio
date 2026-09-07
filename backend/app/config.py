from __future__ import annotations

import os
from pathlib import Path

_BASE = Path(__file__).resolve().parent.parent  # backend/

DATA_DIR = Path(os.environ.get("DATA_DIR", str(_BASE / "data")))
DB_PATH = Path(os.environ.get("DB_PATH", str(DATA_DIR / "radio.db")))
PORT = int(os.environ.get("PORT", "8080"))
DEV = os.environ.get("DEV") == "1"

# Radio-Browser asks callers to send an identifying User-Agent.
RADIO_BROWSER_UA = os.environ.get(
    "RADIO_BROWSER_UA", "my-radio/0.1 (+https://github.com/jvanderzwaag/my-radio)"
)

# now-playing metadata probing
STREAM_USER_AGENT = os.environ.get("STREAM_USER_AGENT", "my-radio/0.1 (+metadata probe)")
NOWPLAYING_STALE_SECONDS = int(os.environ.get("NOWPLAYING_STALE_SECONDS", "25"))
NOWPLAYING_MAX_CONCURRENCY = int(os.environ.get("NOWPLAYING_MAX_CONCURRENCY", "8"))
# how long to sit on a "station publishes no title" result before re-probing
NOWPLAYING_NO_METADATA_TTL = int(os.environ.get("NOWPLAYING_NO_METADATA_TTL", "300"))

# Built frontend (Vite `dist/`), copied to backend/static in the Docker image.
FRONTEND_DIST = Path(os.environ.get("FRONTEND_DIST", str(_BASE / "static")))
