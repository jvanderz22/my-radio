import type { NowPlayingRow, Station } from './types'

async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return (res.status === 204 ? null : await res.json()) as T
}

export const listStations = () => api<Station[]>('/api/stations')

export const fetchNowPlaying = () => api<NowPlayingRow[]>('/api/now-playing')

export const createStation = (name: string, streamUrl: string) =>
  api<Station>('/api/stations', {
    method: 'POST',
    body: JSON.stringify({ name, stream_url: streamUrl }),
  })

export const renameStation = (id: number, name: string) =>
  api<Station>(`/api/stations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })

export const deleteStation = (id: number) =>
  api<null>(`/api/stations/${id}`, { method: 'DELETE' })

export const reorderStations = (ids: number[]) =>
  api<Station[]>('/api/stations/reorder', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  })
