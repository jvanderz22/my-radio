import { useCallback, useState } from 'react'
import type { HistoryEntry } from '../types'

const HISTORY_KEY = 'my-radio:history'
const HISTORY_LIMIT = 50

function load(): HistoryEntry[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY)
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : []
  } catch {
    return []
  }
}

/** Recently-played tracks, kept for this browser session only. `record` appends
 * an entry when the playing station's track changes (deduped against the head). */
export function usePlayHistory(): {
  history: HistoryEntry[]
  record: (stationName: string, track: string) => void
} {
  const [history, setHistory] = useState<HistoryEntry[]>(load)

  const record = useCallback((stationName: string, track: string) => {
    setHistory((prev) => {
      const last = prev[0]
      if (last && last.stationName === stationName && last.track === track) return prev

      const next = [{ when: new Date().toISOString(), stationName, track }, ...prev].slice(
        0,
        HISTORY_LIMIT,
      )
      try {
        sessionStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      } catch {
        // private browsing / quota / disabled storage — history just won't persist
      }
      return next
    })
  }, [])

  return { history, record }
}
