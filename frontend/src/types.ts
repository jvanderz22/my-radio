export interface Station {
  id: number
  name: string
  stream_url: string
  homepage_url: string | null
  favicon_url?: string | null
  codec?: string | null
  bitrate?: number | null
  np_status: string | null
  np_raw: string | null
  np_fetched_at: string | null
}

export interface NowPlayingRow {
  station_id: number
  status: string
  raw: string | null
  fetched_at: string | null
}

export interface HistoryEntry {
  when: string // ISO
  stationName: string
  track: string
}
