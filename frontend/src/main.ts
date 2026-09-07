interface Station {
  id: number
  name: string
  stream_url: string
  homepage_url: string | null
  np_status: string | null
  np_artist: string | null
  np_title: string | null
  np_raw: string | null
}

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

function nowPlaying(s: Station): string {
  if (s.np_artist || s.np_title) {
    return [s.np_artist, s.np_title].filter(Boolean).join(' — ')
  }
  return s.np_raw ?? '—' // real metadata arrives in milestone 3
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
      np.className = 'np'
      np.textContent = nowPlaying(s)
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
          await refresh()
        }
      }

      const del = document.createElement('button')
      del.textContent = 'delete'
      del.className = 'ghost'
      del.onclick = async () => {
        if (!confirm(`Delete "${s.name}"?`)) return
        if (s.id === playingId) stop()
        await api(`/api/stations/${s.id}`, { method: 'DELETE' })
        await refresh()
      }

      li.append(playBtn, meta, rename, del)
      return li
    }),
  )
}

async function refresh(): Promise<void> {
  try {
    stations = await api<Station[]>('/api/stations')
    statusEl.textContent = ''
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
      body: JSON.stringify({
        name: addName.value.trim(),
        stream_url: addUrl.value.trim(),
      }),
    })
    addForm.reset()
    addName.focus()
    await refresh()
  } catch (err) {
    statusEl.textContent = `add failed — ${(err as Error).message}`
  }
}

void refresh()
setInterval(refresh, 20_000) // milestone 3 makes this refresh live now-playing
