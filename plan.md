# my-radio — plan

An internet-radio **playlist** app. Add stations, see what each one is *currently
playing*, click one to play it.

## Stack

| Layer | Choice |
|---|---|
| Backend | Python, **FastAPI** + uvicorn, `httpx` (outbound), `aiosqlite` |
| Frontend | **Vite + vanilla TypeScript** (no framework), built into `backend/static/` |
| DB | **SQLite** at `$DATA_DIR/radio.db` (Fly volume in prod) |
| Deploy | 2-stage Dockerfile (node build → python runtime), **Fly.io**, single machine + volume |

Local dev uses system Python 3.9 (fine — code has `from __future__ import annotations`);
the Docker/prod runtime is Python 3.12. A newer local interpreter is nice-to-have:
`pyenv install 3.12 && pyenv local 3.12`.

## Key design decisions

### On-demand metadata polling (no background worker)
Fly's `auto_stop_machines='stop'` + `min_machines_running=0` means the machine
sleeps when idle, so a continuous "poll every 30s" loop can't be relied on. Instead:
the frontend calls `GET /api/now-playing` when the tab is open (and every ~20s
after); the backend refreshes only entries whose cache is older than ~25s, fetching
them concurrently. Machine stays awake while in use, sleeps otherwise, nothing to
supervise. Track history / alerts (v2) would need `min_machines_running=1` or a Fly
cron.

### Audio proxy required in prod
Fly forces HTTPS; many radio streams are HTTP-only → browser blocks them as mixed
content. `GET /stream/{id}` pipes the upstream audio through the backend. Locally
over HTTP the frontend can point `<audio>` straight at the source.

### "What's playing" — fallback chain (in `icy.py`, milestone 3)
1. **Icecast** `status-json.xsl` (derive base URL from the stream URL) — cheap, JSON.
2. **Shoutcast** `/7.html` or `/stats?sid=1`.
3. **ICY inline metadata** — `httpx.stream` with `Icy-MetaData: 1`, read `icy-metaint`
   bytes of audio, then the metadata block, parse `StreamTitle='Artist - Title';`,
   abort the socket. ~8s timeout.
4. None of the above → `status = no_metadata`, still playable.

Split `raw_stream_title` on ` - ` for artist/title (best-effort). Per-station
exponential backoff via `consecutive_failures` / `next_retry_at`.

### Radio-Browser for discovery
[api.radio-browser.info](https://api.radio-browser.info) — free, no key, ~50k
stations. Used only for *search* (name/tag/country); it has no live now-playing.
Proxied through `GET /api/search` so the `User-Agent` + mirror selection stay
server-side. Manual URL entry is the fallback for stations not in the directory.

## Data model

- **stations** — id, name, stream_url, homepage_url, favicon_url, codec, bitrate,
  radio_browser_uuid, sort_order, created_at
- **now_playing** — station_id (PK/FK), raw_stream_title, artist, title, status
  (`unknown`|`ok`|`no_metadata`|`error`), fetched_at, consecutive_failures,
  next_retry_at
- *(v2)* **track_history** — station_id, artist, title, first_seen, last_seen

## Endpoints

| Route | Purpose | Milestone |
|---|---|---|
| `GET /healthz` | Fly health check | 1 ✅ |
| `GET /api/stations` | stations + cached now-playing | 2 ✅ |
| `POST /api/stations` | add (manual or from search result) | 2 ✅ |
| `PATCH /api/stations/{id}` · `DELETE /api/stations/{id}` | edit / remove | 2 ✅ |
| `POST /api/stations/reorder` | drag-reorder | 6 |
| `GET /api/now-playing` | refresh stale entries concurrently, return all | 3 |
| `GET /api/search?q=&tag=&country=` | proxy Radio-Browser | 5 |
| `GET /stream/{id}` | audio proxy (StreamingResponse) | 4 |

## Milestones

- [x] **1 — scaffold + prove the pipeline.** FastAPI app, `aiosqlite` schema on
  startup, `/healthz`, stubbed `/api/stations`, Vite/TS frontend shell, Dockerfile,
  fly.toml, volume. Deploy the empty shell to Fly.
- [x] **2 — playlist CRUD + frontend.** Add / list / rename / delete stations
  (`app/stations.py` router, Pydantic models, `backend/tests/test_stations.py`).
  Frontend: add form, station list, play/stop via direct stream URL, 20s poll.
- [ ] **3 — now-playing.** `icy.py` fallback chain + `GET /api/now-playing` with
  cache + backoff. Frontend list shows current track, auto-refresh every 20s while
  tab visible.
- [ ] **4 — audio proxy.** `GET /stream/{id}`; frontend uses it in prod. Verify on
  Fly with an HTTP-only station.
- [ ] **5 — Radio-Browser search.** `GET /api/search` + search-to-add UI.
- [ ] **6 — polish.** Drag reorder, favicons, `no_metadata`/error states, HLS
  fallback (`hls.js` lazy-loaded only for `.m3u8`).

## v2 ideas
Track history per station; alerts ("notify when station X plays artist Y");
last.fm scrobbling; tags/folders; import/export OPML.

## Deploy (Fly)

```sh
fly launch --no-deploy          # generates the app; keep this fly.toml
fly volumes create radio_data --region iad --size 1
fly scale count 1               # SQLite = single machine, always
fly deploy
```

Backups (add when it matters): Fly volume snapshots are automatic (~5-day
retention). For continuous backup add **Litestream** replicating to Fly Tigris —
in-process, ~$0.

## Cost
~$0.15/month for the 1 GB volume (billed on provisioned size, even while the
machine is auto-stopped). SQLite adds no compute cost. Machine compute with
auto-stop is a couple dollars/month or less for personal use.
