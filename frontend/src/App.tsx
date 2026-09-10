import { useCallback, useEffect, useRef, useState } from 'react'
import { AddStationForm } from './components/AddStationForm'
import { History } from './components/History'
import { PlayerBar } from './components/PlayerBar'
import { RadioIcon } from './components/icons'
import { StationList } from './components/StationList'
import { ThemeToggle } from './components/ThemeToggle'
import { useAudio } from './hooks/useAudio'
import { usePlayHistory } from './hooks/usePlayHistory'
import * as api from './api'
import type { NowPlayingRow, Station } from './types'

const POLL_MS = 20_000
const BASE_TITLE = document.title // restored when nothing is playing

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

function mergeNowPlaying(stations: Station[], rows: NowPlayingRow[]): Station[] {
  const byId = new Map(rows.map((r) => [r.station_id, r]))
  return stations.map((s) => {
    const r = byId.get(s.id)
    return {
      ...s,
      np_status: r?.status ?? null,
      np_raw: r?.raw ?? null,
      np_fetched_at: r?.fetched_at ?? null,
    }
  })
}

export function App() {
  const [stations, setStations] = useState<Station[]>([])
  const [playingId, setPlayingId] = useState<number | null>(null)
  const [status, setStatusState] = useState('')

  // Kept in sync with state so the interval / keydown closures can read the
  // latest values without being re-created on every change.
  const stationsRef = useRef<Station[]>([])
  const playingIdRef = useRef<number | null>(null)
  useEffect(() => {
    stationsRef.current = stations
  }, [stations])
  useEffect(() => {
    playingIdRef.current = playingId
  }, [playingId])

  // --- transient status line (auto-clears) ---
  const statusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const setStatus = useCallback((message: string, autoClearMs = 6000) => {
    clearTimeout(statusTimer.current)
    setStatusState(message)
    if (message && autoClearMs > 0) {
      statusTimer.current = setTimeout(
        () => setStatusState((cur) => (cur === message ? '' : cur)),
        autoClearMs,
      )
    }
  }, [])

  const { controller: audio, paused } = useAudio(setStatus)
  const { history, record } = usePlayHistory()

  // --- playback ---
  const play = useCallback(
    (s: Station) => {
      audio.play(s.stream_url)
      setPlayingId(s.id)
    },
    [audio],
  )

  const stop = useCallback(() => {
    audio.stop()
    setPlayingId(null)
  }, [audio])

  const playAt = useCallback(
    (index: number) => {
      const list = stationsRef.current
      if (list.length === 0) return
      const wrapped = ((index % list.length) + list.length) % list.length
      play(list[wrapped])
    },
    [play],
  )

  const playRelative = useCallback(
    (delta: number) => {
      const list = stationsRef.current
      const cur = list.findIndex((s) => s.id === playingIdRef.current)
      playAt(cur === -1 ? (delta > 0 ? 0 : -1) : cur + delta)
    },
    [playAt],
  )

  // --- data loading ---
  const refreshNowPlaying = useCallback(async () => {
    const rows = await api.fetchNowPlaying()
    const merged = mergeNowPlaying(stationsRef.current, rows)
    stationsRef.current = merged
    setStations(merged)

    const pid = playingIdRef.current
    if (pid != null) {
      const s = merged.find((x) => x.id === pid)
      if (s && s.np_status === 'ok' && s.np_raw) record(s.name, s.np_raw)
    }
  }, [record])

  const reloadAll = useCallback(async () => {
    try {
      const list = await api.listStations()
      stationsRef.current = list
      setStations(list)
      await refreshNowPlaying()
      setStatus('')
    } catch (err) {
      setStatus(`error: ${(err as Error).message}`)
    }
  }, [refreshNowPlaying, setStatus])

  // --- mutations ---
  const addStation = useCallback(
    async (name: string, streamUrl: string) => {
      try {
        await api.createStation(name, streamUrl)
        await reloadAll()
        return true
      } catch (err) {
        setStatus(`add failed — ${(err as Error).message}`)
        return false
      }
    },
    [reloadAll, setStatus],
  )

  const renameStation = useCallback(
    async (s: Station) => {
      const next = prompt('New name', s.name)?.trim()
      if (!next || next === s.name) return
      try {
        await api.renameStation(s.id, next)
        await reloadAll()
      } catch (err) {
        setStatus(`rename failed — ${(err as Error).message}`)
      }
    },
    [reloadAll, setStatus],
  )

  const deleteStation = useCallback(
    async (s: Station) => {
      if (!confirm(`Delete "${s.name}"?`)) return
      if (s.id === playingIdRef.current) stop()
      try {
        await api.deleteStation(s.id)
        await reloadAll()
      } catch (err) {
        setStatus(`delete failed — ${(err as Error).message}`)
      }
    },
    [reloadAll, stop, setStatus],
  )

  /** Move a station up (-1) or down (+1). Optimistic: reorder locally now, then
   * reconcile with the server's canonical list. */
  const moveStation = useCallback(
    async (id: number, delta: -1 | 1) => {
      const list = stationsRef.current
      const from = list.findIndex((s) => s.id === id)
      const to = from + delta
      if (from === -1 || to < 0 || to >= list.length) return

      const reordered = list.slice()
      const [moved] = reordered.splice(from, 1)
      reordered.splice(to, 0, moved)
      stationsRef.current = reordered
      setStations(reordered)

      try {
        const fresh = await api.reorderStations(reordered.map((s) => s.id))
        stationsRef.current = fresh
        setStations(fresh)
      } catch (err) {
        setStatus(`reorder failed — ${(err as Error).message}`)
        await reloadAll()
      }
    },
    [reloadAll, setStatus],
  )

  // --- initial load ---
  useEffect(() => {
    void reloadAll()
  }, [reloadAll])

  // --- polling: every 20s, skipped for a hidden tab unless audio is playing ---
  useEffect(() => {
    const tick = () => {
      const el = audio.ref.current
      const playing = playingIdRef.current != null && !!el && !el.paused && !el.ended
      if (document.visibilityState !== 'visible' && !playing) return
      refreshNowPlaying().catch((err) => setStatus(`error: ${(err as Error).message}`))
    }
    const id = setInterval(tick, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshNowPlaying().catch((err) => setStatus(`error: ${(err as Error).message}`))
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [audio, refreshNowPlaying, setStatus])

  // --- browser tab title reflects what's playing ---
  useEffect(() => {
    const s = playingId == null ? undefined : stations.find((x) => x.id === playingId)
    if (!s) {
      document.title = BASE_TITLE
      return
    }
    const label = s.np_status === 'ok' && s.np_raw ? `${s.np_raw} — ${s.name}` : s.name
    document.title = `${paused ? '⏸' : '▶'} ${label}`
  }, [stations, playingId, paused])

  // --- hotkeys: space = play/pause, ↑/↓ = volume, ←/→ = previous/next ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          if (!audio.hasSource()) playAt(0)
          else audio.toggle()
          break
        case 'ArrowUp':
          e.preventDefault()
          audio.nudgeVolume(1)
          break
        case 'ArrowDown':
          e.preventDefault()
          audio.nudgeVolume(-1)
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
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [audio, playAt, playRelative])

  const current = playingId == null ? undefined : stations.find((s) => s.id === playingId)

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-8 sm:py-12">
      <header className="mb-5 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <RadioIcon className="size-6 text-indigo-500" />
          my-radio
        </h1>
        <ThemeToggle />
      </header>

      {status && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {status}
        </p>
      )}

      <div className="mb-5">
        <AddStationForm onAdd={addStation} />
      </div>

      <StationList
        stations={stations}
        playingId={playingId}
        paused={paused}
        onPlay={play}
        onToggle={audio.toggle}
        onStop={stop}
        onMove={moveStation}
        onRename={renameStation}
        onDelete={deleteStation}
      />

      <div className="mt-6">
        <History entries={history} />
      </div>

      <div className="flex-1" />

      <PlayerBar
        audioRef={audio.ref}
        station={current}
        paused={paused}
        onToggle={audio.toggle}
        onStop={stop}
      />

      <p className="mt-3 text-center text-xs text-neutral-400 dark:text-neutral-600">
        <kbd className="rounded border border-current/30 px-1">space</kbd> play/pause ·{' '}
        <kbd className="rounded border border-current/30 px-1">←</kbd>/
        <kbd className="rounded border border-current/30 px-1">→</kbd> prev/next ·{' '}
        <kbd className="rounded border border-current/30 px-1">↑</kbd>/
        <kbd className="rounded border border-current/30 px-1">↓</kbd> volume
      </p>
    </div>
  )
}
