from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator

_EDITABLE = ("name", "stream_url", "homepage_url", "favicon_url", "codec", "bitrate")


def _http_url(v: Optional[str]) -> Optional[str]:
    if v is None:
        return v
    v = v.strip()
    if v and not v.startswith(("http://", "https://")):
        raise ValueError("must be an http(s) URL")
    return v or None


class StationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    stream_url: str = Field(min_length=1, max_length=2000)
    homepage_url: Optional[str] = None
    favicon_url: Optional[str] = None
    codec: Optional[str] = Field(default=None, max_length=32)
    bitrate: Optional[int] = Field(default=None, ge=0, le=10_000)
    radio_browser_uuid: Optional[str] = Field(default=None, max_length=64)

    _v_stream = field_validator("stream_url")(_http_url)
    _v_home = field_validator("homepage_url")(_http_url)
    _v_favicon = field_validator("favicon_url")(_http_url)


class StationsReorder(BaseModel):
    # The full set of station ids in the desired order; sort_order becomes the index.
    ids: list[int] = Field(min_length=1)


class StationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    stream_url: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    homepage_url: Optional[str] = None
    favicon_url: Optional[str] = None
    codec: Optional[str] = Field(default=None, max_length=32)
    bitrate: Optional[int] = Field(default=None, ge=0, le=10_000)

    _v_stream = field_validator("stream_url")(_http_url)
    _v_home = field_validator("homepage_url")(_http_url)
    _v_favicon = field_validator("favicon_url")(_http_url)
