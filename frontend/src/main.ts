interface Station {
  id: number
  name: string
  stream_url: string
  homepage_url: string | null
  np_status: string | null
  np_artist: string | null
  np_title: string | null
  np_raw: string | null
  np_fetched_at: string | null
}

interface NowPlayingRow {
  station_id: number
  status: string
  artist: string | null
  title: string | null
  raw: string | null
  fetched_at: string | null
}

const POLL_MS = 20_000

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const statusEl = $('status')
const listEl = $<HTMLUListElement>('stations')
const emptyEl = $('empty')
const player = $<HTMLAudioElement>('player')
const addForm = $<HTMLFormElement>('add-form')
const addName = $<HTMLInputElement>('add-name')
const addUrl = $<HTMLInputElement>('add-url')

let stations: Station[] = []
let playingId: number | null = null

async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return (res.status === 204 ? null : await res.json()) as T
}

function trackText(s: Station): string {
  if (s.np_artist || s.np_title) return [s.np_artist, s.np_title].filter(Boolean).join(' — ')
  if (s.np_status === 'no_metadata') return 'no track info'
  if (s.np_status === 'error') return 'unavailable'
  return s.np_raw ?? '…'
}

function ago(iso: string | null): string {
  if (!iso) return ''
  const secs = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`
  return `${Math.round(secs / 3600)}h ago`
}

function play(s: Station): void {
  player.src = s.stream_url // direct stream locally; /stream/{id} proxy comes in milestone 4
  player.play().catch((e) => (statusEl.textContent = `play error: ${e.message}`))
  playingId = s.id
  render()
}

function stop(): void {
  player.pause()
  player.removeAttribute('src')
  player.load()
  playingId = null
  render()
}

function render(): void {
  emptyEl.hidden = stations.length > 0
  listEl.replaceChildren(
    ...stations.map((s) => {
      const li = document.createElement('li')
      li.className = s.id === playingId ? 'playing' : ''

      const playBtn = document.createElement('button')
      playBtn.textContent = s.id === playingId ? '■ stop' : '▶ play'
      playBtn.onclick = () => (s.id === playingId ? stop() : play(s))

      const meta = document.createElement('div')
      meta.className = 'meta'
      const name = document.createElement('div')
      name.className = 'name'
      name.textContent = s.name
      const np = document.createElement('div')
      np.className = `np${s.np_status && s.np_status !== 'ok' ? ' np-dim' : ''}`
      np.textContent = trackText(s)
      const when = document.createElement('span')
      when.className = 'when'
      when.textContent = ago(s.np_fetched_at)
      np.append(' ', when)
      meta.append(name, np)

      const rename = document.createElement('button')
      rename.textContent = 'rename'
      rename.className = 'ghost'
      rename.onclick = async () => {
        const next = prompt('New name', s.name)?.trim()
        if (next && next !== s.name) {
          await api(`/api/stations/${s.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ name: next }),
          })
          await reloadAll()
        }
      }

      const del = document.createElement('button')
      del.textContent = 'delete'
      del.className = 'ghost'
      del.onclick = async () => {
        if (!confirm(`Delete "${s.name}"?`)) return
        if (s.id === playingId) stop()
        await api(`/api/stations/${s.id}`, { method: 'DELETE' })
        await reloadAll()
      }

      li.append(playBtn, meta, rename, del)
      return li
    }),
  )
}

async function loadStations(): Promise<void> {
  stations = await api<Station[]>('/api/stations')
}

async function loadNowPlaying(): Promise<void> {
  const rows = await api<NowPlayingRow[]>('/api/now-playing')
  const byId = new Map(rows.map((r) => [r.station_id, r]))
  for (const s of stations) {
    const r = byId.get(s.id)
    s.np_status = r?.status ?? null
    s.np_artist = r?.artist ?? null
    s.np_title = r?.title ?? null
    s.np_raw = r?.raw ?? null
    s.np_fetched_at = r?.fetched_at ?? null
  }
}

/** Full reload: station list + now-playing. Used on load and after mutations. */
async function reloadAll(): Promise<void> {
  try {
    await loadStations()
    render()
    await loadNowPlaying()
    render()
    statusEl.textContent = ''
  } catch (err) {
    statusEl.textContent = `error: ${(err as Error).message}`
  }
}

async function tick(): Promise<void> {
  if (document.visibilityState !== 'visible') return
  try {
    await loadNowPlaying()
    render()
  } catch (err) {
    statusEl.textContent = `error: ${(err as Error).message}`
  }
}

addForm.onsubmit = async (e) => {
  e.preventDefault()
  try {
    await api('/api/stations', {
      method: 'POST',
      body: JSON.stringify({ name: addName.value.trim(), stream_url: addUrl.value.trim() }),
    })
    addForm.reset()
    addName.focus()
    await reloadAll()
  } catch (err) {
    statusEl.textContent = `add failed — ${(err as Error).message}`
  }
}

void reloadAll()
setInterval(tick, POLL_MS)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void tick()
})
