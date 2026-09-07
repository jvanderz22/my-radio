"""Best-effort "what's playing right now" for an internet-radio stream.

Fallback chain, cheapest first:
  1. Icecast   -> GET {base}/status-json.xsl        (JSON, no stream read)
  2. Shoutcast -> GET {base}/stats?json=1 or /7.html
  3. ICY       -> read the stream with `Icy-MetaData: 1`, parse `StreamTitle`
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlsplit

import httpx

from .config import STREAM_USER_AGENT

_STREAM_TITLE_RE = re.compile(rb"StreamTitle='(.*?)';")
_TAG_RE = re.compile(r"<[^>]+>")


@dataclass
class NowPlaying:
    status: str  # "ok" | "no_metadata" | "error"
    raw: Optional[str] = None
    artist: Optional[str] = None
    title: Optional[str] = None
    detail: Optional[str] = None


def split_title(raw: str) -> tuple[Optional[str], Optional[str]]:
    """`"Artist - Track"` -> `("Artist", "Track")`; no separator -> `(None, raw)`."""
    raw = raw.strip()
    if " - " in raw:
        artist, title = raw.split(" - ", 1)
        return (artist.strip() or None), (title.strip() or None)
    return None, (raw or None)


def _ok(raw: str) -> NowPlaying:
    raw = raw.strip()
    artist, title = split_title(raw)
    return NowPlaying(status="ok", raw=raw, artist=artist, title=title)


def _base_url(stream_url: str) -> str:
    parts = urlsplit(stream_url)
    return f"{parts.scheme}://{parts.netloc}"


async def fetch_now_playing(client: httpx.AsyncClient, stream_url: str) -> NowPlaying:
    """Try each source in turn. Transport failures fall through to the next."""
    errors: list[str] = []
    reached_a_server = False
    for name, probe in (("icecast", _icecast), ("shoutcast", _shoutcast), ("icy", _icy_inline)):
        try:
            result = await probe(client, stream_url)
        except httpx.HTTPError as exc:
            errors.append(f"{name}: {exc!r}")
            continue
        reached_a_server = True
        if result.status == "ok":
            return result
        errors.append(f"{name}: {result.detail or result.status}")
    return NowPlaying(
        status="no_metadata" if reached_a_server else "error",
        detail="; ".join(errors)[:500] or None,
    )


async def _icecast(client: httpx.AsyncClient, stream_url: str) -> NowPlaying:
    r = await client.get(f"{_base_url(stream_url)}/status-json.xsl", timeout=5.0)
    if r.status_code != 200:
        return NowPlaying("no_metadata", detail=f"icecast HTTP {r.status_code}")
    try:
        data = r.json()
    except ValueError:
        return NowPlaying("no_metadata", detail="icecast: bad json")

    sources = (data.get("icestats") or {}).get("source", [])
    if isinstance(sources, dict):
        sources = [sources]
    want_path = urlsplit(stream_url).path
    fallback: Optional[str] = None
    for src in sources:
        title = (src.get("title") or src.get("yp_currently_playing") or "").strip()
        if not title:
            continue
        if want_path and str(src.get("listenurl", "")).endswith(want_path):
            return _ok(title)
        fallback = fallback or title
    return _ok(fallback) if fallback else NowPlaying("no_metadata", detail="icecast: no title")


async def _shoutcast(client: httpx.AsyncClient, stream_url: str) -> NowPlaying:
    base = _base_url(stream_url)

    r = await client.get(f"{base}/stats?json=1", timeout=5.0)
    if r.status_code == 200:
        try:
            song = (r.json() or {}).get("songtitle")
        except ValueError:
            song = None
        if song:
            return _ok(song)

    # Shoutcast v1: /7.html returns a CSV row, song title after the 6th comma.
    r = await client.get(
        f"{base}/7.html", timeout=5.0, headers={"User-Agent": "Mozilla/5.0"}
    )
    if r.status_code == 200 and "," in r.text:
        parts = _TAG_RE.sub("", r.text).strip().split(",", 6)
        if len(parts) == 7 and parts[6].strip():
            return _ok(parts[6].strip())

    return NowPlaying("no_metadata", detail="shoutcast: no songtitle")


async def _icy_inline(client: httpx.AsyncClient, stream_url: str) -> NowPlaying:
    headers = {
        "Icy-MetaData": "1",
        "User-Agent": STREAM_USER_AGENT,
        "Accept": "*/*",
    }
    async with client.stream(
        "GET", stream_url, headers=headers, timeout=httpx.Timeout(6.0)
    ) as resp:
        resp.raise_for_status()
        raw_metaint = resp.headers.get("icy-metaint")
        if not raw_metaint or not raw_metaint.isdigit():
            return NowPlaying("no_metadata", detail="no icy-metaint header")
        metaint = int(raw_metaint)
        if not 0 < metaint <= 1_000_000:
            return NowPlaying("no_metadata", detail=f"implausible icy-metaint {metaint}")

        buf = bytearray()
        meta_pos = metaint
        max_bytes = metaint * 4 + 16_384  # ~4 metadata intervals, then give up
        async for chunk in resp.aiter_bytes():
            buf.extend(chunk)
            while len(buf) > meta_pos:
                block_len = buf[meta_pos] * 16
                if block_len == 0:
                    meta_pos += 1 + metaint
                    continue
                if len(buf) < meta_pos + 1 + block_len:
                    break  # need more bytes for this block
                block = bytes(buf[meta_pos + 1 : meta_pos + 1 + block_len])
                match = _STREAM_TITLE_RE.search(block)
                if match and match.group(1).strip():
                    text = match.group(1).decode("utf-8", "replace").strip()
                    return _ok(text)
                meta_pos += 1 + block_len + metaint
            if len(buf) >= max_bytes:
                break
    return NowPlaying("no_metadata", detail="no StreamTitle in stream")
