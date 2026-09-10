from fastapi.testclient import TestClient

from app.main import app

SOMA = "https://ice.somafm.com/groovesalad-128-mp3"


def test_station_crud():
    with TestClient(app) as client:  # context manager runs the lifespan (DB connect)
        assert client.get("/healthz").json() == {"ok": True}
        assert client.get("/api/stations").json() == []

        created = client.post(
            "/api/stations", json={"name": "SomaFM Groove Salad", "stream_url": SOMA}
        )
        assert created.status_code == 201
        row = created.json()
        sid = row["id"]
        assert row["name"] == "SomaFM Groove Salad"
        assert row["stream_url"] == SOMA
        assert row["np_status"] is None  # no now_playing row yet

        renamed = client.patch(f"/api/stations/{sid}", json={"name": "Groove Salad"})
        assert renamed.status_code == 200
        assert renamed.json()["name"] == "Groove Salad"

        listed = client.get("/api/stations").json()
        assert [s["id"] for s in listed] == [sid]

        assert client.delete(f"/api/stations/{sid}").status_code == 204
        assert client.get("/api/stations").json() == []


def test_reorder():
    with TestClient(app) as client:
        ids = [
            client.post("/api/stations", json={"name": n, "stream_url": SOMA}).json()["id"]
            for n in ("A", "B", "C")
        ]
        assert [s["id"] for s in client.get("/api/stations").json()] == ids

        want = [ids[2], ids[0], ids[1]]
        r = client.post("/api/stations/reorder", json={"ids": want})
        assert r.status_code == 200
        assert [s["id"] for s in r.json()] == want
        assert [s["id"] for s in client.get("/api/stations").json()] == want

        # must list every station exactly once
        assert client.post("/api/stations/reorder", json={"ids": ids[:2]}).status_code == 400
        assert client.post("/api/stations/reorder", json={"ids": ids + [999]}).status_code == 400
        assert client.post("/api/stations/reorder", json={"ids": [ids[0]] * 3}).status_code == 400

        for sid in ids:
            client.delete(f"/api/stations/{sid}")


def test_bad_input():
    with TestClient(app) as client:
        # non-http stream URL is rejected
        r = client.post("/api/stations", json={"name": "x", "stream_url": "ftp://nope"})
        assert r.status_code == 422
        # deleting a missing station is a 404
        assert client.delete("/api/stations/99999").status_code == 404
