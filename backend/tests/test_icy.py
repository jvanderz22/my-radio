import httpx

from app.icy import fetch_now_playing, split_title


def test_split_title():
    assert split_title("Artist - Song") == ("Artist", "Song")
    assert split_title("  no separator  ") == (None, "no separator")
    assert split_title("A - B - C") == ("A", "B - C")
    assert split_title("") == (None, None)


def _client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_icecast_status_json():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/status-json.xsl":
            return httpx.Response(
                200,
                json={
                    "icestats": {
                        "source": {
                            "listenurl": "http://x/stream",
                            "title": "Boards of Canada - Roygbiv",
                        }
                    }
                },
            )
        return httpx.Response(404)

    async with _client(handler) as client:
        np = await fetch_now_playing(client, "http://x/stream")

    assert np.status == "ok"
    assert (np.artist, np.title) == ("Boards of Canada", "Roygbiv")


async def test_shoutcast_v1_7html():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/7.html":
            return httpx.Response(200, text="<HTML><BODY>5,1,9,100,4,128,Autechre - Rae</BODY></HTML>")
        return httpx.Response(404)

    async with _client(handler) as client:
        np = await fetch_now_playing(client, "http://sc.example/;")

    assert np.status == "ok"
    assert (np.artist, np.title) == ("Autechre", "Rae")


async def test_icy_inline_metadata():
    metaint = 16
    block = b"StreamTitle='Aphex Twin - Xtal';"
    block += b"\x00" * ((-len(block)) % 16)
    body = b"\x00" * metaint + bytes([len(block) // 16]) + block + b"\x00" * metaint

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path in ("/status-json.xsl", "/stats", "/7.html"):
            return httpx.Response(404)
        return httpx.Response(200, headers={"icy-metaint": str(metaint)}, content=body)

    async with _client(handler) as client:
        np = await fetch_now_playing(client, "http://radio.example/live")

    assert np.status == "ok"
    assert (np.artist, np.title) == ("Aphex Twin", "Xtal")


async def test_reachable_but_silent_is_no_metadata():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/live":
            return httpx.Response(200, content=b"\x00" * 4096)  # audio, no icy-metaint
        return httpx.Response(404)

    async with _client(handler) as client:
        np = await fetch_now_playing(client, "http://radio.example/live")

    assert np.status == "no_metadata"
