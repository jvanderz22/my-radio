# my-radio

Internet-radio playlist. Add stations, see what each is currently playing, pick one
to play. See [plan.md](plan.md) for architecture and milestones.

## Local dev

Two processes: FastAPI on `:8080`, Vite dev server on `:5173` (proxies `/api`,
`/healthz`, `/stream` to `:8080`).

### Backend

```sh
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

The SQLite file is created on first start at `backend/data/radio.db` (override with
`DATA_DIR` or `DB_PATH`). Check it: `curl localhost:8080/healthz`.

### Frontend

```sh
cd frontend
npm install
npm run dev          # http://localhost:5173
```

To serve the built UI from FastAPI instead (as in prod):

```sh
cd frontend && npm run build     # emits frontend/dist/
cd ../backend                    # uvicorn must run from backend/
FRONTEND_DIST=../frontend/dist uvicorn app.main:app --port 8080
```

## Deploy

See the Deploy section in [plan.md](plan.md).
