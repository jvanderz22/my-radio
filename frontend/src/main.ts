interface Station {
  id: number
  name: string
  stream_url: string
  homepage_url: string | null
  np_status: string | null
  np_raw: string | null
  np_fetched_at: string | null
}

interface NowPlayingRow {
  station_id: number
  status: string
  raw: string | null
  fetched_at: string | null
}

interface HistoryEntry {
  when: string // ISO
  stationName: string
  track: string
}

const POLL_MS = 20_000
const HISTORY_KEY = 'my-radio:history'
const HISTORY_LIMIT = 50
const VOLUME_STEP = 0.05
const BASE_TITLE = document.title // restored to this when nothing is playing

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const statusEl = $('status')
const listEl = $<HTMLUListElement>('stations')
const emptyEl = $('empty')
const player = $<HTMLAudioElement>('player')
const addForm = $<HTMLFormElement>('add-form')
const addName = $<HTMLInputElement>('add-name')
const addUrl = $<HTMLInputElement>('add-url')
const historySection = $('history-section')
const historyList = $<HTMLUListElement>('history-list')

let stations: Station[] = []
let playingId: number | null = null
let playHistory: HistoryEntry[] = loadHistory()

async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return (res.status === 204 ? null : await res.json()) as T
}

function trackText(s: Station): string {
  // Shown as-is, never split into artist/title — the "A - B" shape a station
  // publishes is just as often a show/segment name as a real track credit,
  // and there's no reliable way to tell those apart.
  if (s.np_raw) return s.np_raw
  if (s.np_status === 'no_metadata') return 'no track info'
  if (s.np_status === 'error') return 'unavailable'
  return '…'
}

function ago(iso: string | null): string {
  if (!iso) return ''
  const secs = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`
  return `${Math.round(secs / 3600)}h ago`
}

let statusTimer: ReturnType<typeof setTimeout> | undefined

/** Sets the status line; non-empty messages clear themselves after a few seconds. */
function setStatus(message: string, autoClearMs = 6000): void {
  clearTimeout(statusTimer)
  statusEl.textContent = message
  if (message && autoClearMs > 0) {
    statusTimer = setTimeout(() => {
      if (statusEl.textContent === message) statusEl.textContent = ''
    }, autoClearMs)
  }
}

/** Fires and forgets `<audio>.play()`, swallowing the routine "interrupted by
 * a call to pause()" AbortError — switching stations or pausing quickly
 * cancels the in-flight play() promise; that's expected, not a real error. */
function safePlay(): void {
  player.play().catch((err: unknown) => {
    if (err instanceof DOMException && err.name === 'AbortError') return
    setStatus(`play error: ${(err as Error).message}`)
  })
}

function play(s: Station): void {
  player.src = s.stream_url // direct stream locally; /stream/{id} proxy comes in milestone 4
  safePlay()
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

function togglePause(): void {
  if (player.paused) safePlay()
  else player.pause()
}

// --- recently played (this browser session only) ---

function loadHistory(): HistoryEntry[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY)
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : []
  } catch {
    return []
  }
}

function saveHistory(): void {
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(playHistory))
  } catch {
    // private browsing / quota / disabled storage — history just won't persist
  }
}

/** Appends to history when the currently-playing station's track changes. */
function recordHistory(): void {
  if (playingId === null) return
  const s = stations.find((st) => st.id === playingId)
  if (!s || s.np_status !== 'ok' || !s.np_raw) return

  const last = playHistory[0]
  if (last && last.stationName === s.name && last.track === s.np_raw) return

  playHistory.unshift({ when: new Date().toISOString(), stationName: s.name, track: s.np_raw })
  if (playHistory.length > HISTORY_LIMIT) playHistory.length = HISTORY_LIMIT
  saveHistory()
  renderHistory()
}

function renderHistory(): void {
  historySection.hidden = playHistory.length === 0
  historyList.replaceChildren(
    ...playHistory.map((h) => {
      const li = document.createElement('li')
      const when = document.createElement('span')
      when.className = 'when'
      when.textContent = new Date(h.when).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const entry = document.createElement('span')
      entry.className = 'entry'
      entry.textContent = `${h.track} — ${h.stationName}`
      li.append(when, entry)
      return li
    }),
  )
}

// --- station list ---

/** Reflects the current station and track in the browser tab title, so a
 * backgrounded tab shows what's playing. Reverts to BASE_TITLE when stopped. */
function updateDocumentTitle(): void {
  const s = playingId === null ? undefined : stations.find((st) => st.id === playingId)
  if (!s) {
    document.title = BASE_TITLE
    return
  }
  const label = s.np_status === 'ok' && s.np_raw ? `${s.np_raw} — ${s.name}` : s.name
  document.title = `${player.paused ? '⏸' : '▶'} ${label}`
}

function render(): void {
  emptyEl.hidden = stations.length > 0
  listEl.replaceChildren(
    ...stations.map((s) => {
      const li = document.createElement('li')
      const isCurrent = s.id === playingId
      li.className = isCurrent ? 'playing' : ''

      const playBtn = document.createElement('button')
      const isPaused = isCurrent && player.paused
      playBtn.textContent = isCurrent ? (isPaused ? '▶ resume' : '⏸ pause') : '▶ play'
      playBtn.onclick = () => (isCurrent ? togglePause() : play(s))

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

      li.append(playBtn)
      if (isCurrent) {
        const stopBtn = document.createElement('button')
        stopBtn.textContent = '✕'
        stopBtn.title = 'Stop'
        stopBtn.className = 'ghost'
        stopBtn.onclick = () => stop()
        li.append(stopBtn)
      }
      li.append(meta, rename, del)
      return li
    }),
  )
  updateDocumentTitle()
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
    recordHistory()
    render()
    setStatus('')
  } catch (err) {
    setStatus(`error: ${(err as Error).message}`)
  }
}

/** True while a station is actually producing sound in this tab. */
function isPlaying(): boolean {
  return playingId !== null && !player.paused && !player.ended
}

async function tick(): Promise<void> {
  // Normally we skip polling for a hidden tab to save work, but keep going while
  // audio is playing so the now-playing list and history stay fresh in the
  // background. Browsers don't apply the once-a-minute background timer throttle
  // to tabs that are actively producing sound, so the interval keeps its cadence.
  if (document.visibilityState !== 'visible' && !isPlaying()) return
  try {
    await loadNowPlaying()
    recordHistory()
    render()
  } catch (err) {
    setStatus(`error: ${(err as Error).message}`)
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
    setStatus(`add failed — ${(err as Error).message}`)
  }
}

// --- hotkeys: space = play/pause, ↑/↓ = volume, ←/→ = previous/next station ---

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

function playAt(index: number): void {
  if (stations.length === 0) return
  const wrapped = ((index % stations.length) + stations.length) % stations.length
  play(stations[wrapped])
}

function playRelative(delta: number): void {
  const currentIndex = stations.findIndex((s) => s.id === playingId)
  playAt(currentIndex === -1 ? (delta > 0 ? 0 : -1) : currentIndex + delta)
}

document.addEventListener('keydown', (e) => {
  if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
  switch (e.code) {
    case 'Space':
      e.preventDefault()
      if (!player.src) playAt(0)
      else togglePause()
      break
    case 'ArrowUp':
      e.preventDefault()
      player.volume = Math.min(1, player.volume + VOLUME_STEP)
      break
    case 'ArrowDown':
      e.preventDefault()
      player.volume = Math.max(0, player.volume - VOLUME_STEP)
      break
    case 'ArrowRight':
      e.preventDefault()
      playRelative(1)
      break
    case 'ArrowLeft':
      e.preventDefault()
      playRelative(-1)
      break
  }
})

// Keep the play/pause button in sync when playback state changes for any
// reason (hotkey, native <audio> controls, autoplay policy, etc).
player.addEventListener('play', render)
player.addEventListener('pause', render)

renderHistory()
void reloadAll()
setInterval(tick, POLL_MS)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void tick()
})
