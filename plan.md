# my-radio — plan

An internet-radio **playlist** app. Add stations, see what each one is *currently
playing*, click one to play it.

## Stack

| Layer | Choice |
|---|---|
| Backend | Python, **FastAPI** + uvicorn, `httpx` (outbound), `aiosqlite` |
| Frontend | **Vite + React + TypeScript**, **Tailwind CSS v4**, built into `backend/static/` |
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

`raw_stream_title` is shown verbatim, never split into artist/title: the same
`"A - B"` shape a station publishes is just as often a show/segment name (e.g.
a DJ show titled `"Postcards From The Underground - with Mark"`) as a real
`"Artist - Track"` credit, and there's no reliable way to tell them apart —
guessing wrong mangles the show name, so we don't guess. Per-station
exponential backoff via `consecutive_failures` / `next_retry_at`.

### Radio-Browser for discovery
[api.radio-browser.info](https://api.radio-browser.info) — free, no key, ~50k
stations. Used only for *search* (name/tag/country); it has no live now-playing.
Proxied through `GET /api/search` so the `User-Agent` + mirror selection stay
server-side. Manual URL entry is the fallback for stations not in the directory.

## Data model

- **stations** — id, name, stream_url, homepage_url, favicon_url, codec, bitrate,
  radio_browser_uuid, sort_order, created_at
- **now_playing** — station_id (PK/FK), raw_stream_title (shown verbatim, never
  split), status (`unknown`|`ok`|`no_metadata`|`error`), fetched_at,
  consecutive_failures, next_retry_at
- *(v2)* **track_history** — station_id, raw_stream_title, first_seen, last_seen

## Endpoints

| Route | Purpose | Milestone |
|---|---|---|
| `GET /healthz` | Fly health check | 1 ✅ |
| `GET /api/stations` | stations + cached now-playing | 2 ✅ |
| `POST /api/stations` | add (manual or from search result) | 2 ✅ |
| `PATCH /api/stations/{id}` · `DELETE /api/stations/{id}` | edit / remove | 2 ✅ |
| `POST /api/stations/reorder` | drag-reorder | 6 |
| `GET /api/now-playing` | refresh stale entries concurrently, return all | 3 ✅ |
| `GET /api/search?q=&tag=&country=` | proxy Radio-Browser | 5 |
| `GET /stream/{id}` | audio proxy (StreamingResponse) | 4 |

## Milestones

- [x] **1 — scaffold + prove the pipeline.** FastAPI app, `aiosqlite` schema on
  startup, `/healthz`, stubbed `/api/stations`, Vite/TS frontend shell, Dockerfile,
  fly.toml, volume. Deploy the empty shell to Fly.
- [x] **2 — playlist CRUD + frontend.** Add / list / rename / delete stations
  (`app/stations.py` router, Pydantic models, `backend/tests/test_stations.py`).
  Frontend: add form, station list, play/stop via direct stream URL, 20s poll.
- [x] **3 — now-playing.** `app/icy.py` fallback chain (Icecast JSON → Shoutcast
  v2/v1 → ICY inline) + `app/nowplaying.py` on-demand cache with per-station
  backoff (`error` → exponential, `no_metadata` → 5 min TTL). `GET /api/now-playing`
  probes stale entries concurrently (semaphore 8). Frontend merges results into the
  list, "updated Ns ago", 20s poll gated on tab visibility.
  _Future: remember which probe worked per station to skip the dead attempts._
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
./deploy_fly.sh
```

Idempotent — safe to rerun on every deploy. It creates the app + volume on
first run (skips both if they already exist), pins the machine count to 1
(required: SQLite has one writer, and Fly volumes don't replicate), then
`fly deploy`s. `--secret KEY=VAL` (repeatable) sets Fly secrets once auth or
similar exists. See `./deploy_fly.sh --help`.

Backups (add when it matters): Fly volume snapshots are automatic (~5-day
retention). For continuous backup add **Litestream** replicating to Fly Tigris —
in-process, ~$0.

## Cost
~$0.15/month for the 1 GB volume (billed on provisioned size, even while the
machine is auto-stopped). SQLite adds no compute cost. Machine compute with
auto-stop is a couple dollars/month or less for personal use.
