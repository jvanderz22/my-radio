import type { Station } from './types'

/** The now-playing line for a station. Shown as-is, never split into
 * artist/title — the "A - B" shape a station publishes is just as often a
 * show/segment name as a real track credit, and there's no reliable way to
 * tell those apart. */
export function trackText(s: Station): string {
  if (s.np_raw) return s.np_raw
  if (s.np_status === 'no_metadata') return 'no track info'
  if (s.np_status === 'error') return 'unavailable'
  return '…'
}

/** "12s ago" / "5m ago" / "3h ago" for an ISO timestamp. */
export function ago(iso: string | null | undefined): string {
  if (!iso) return ''
  const secs = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`
  return `${Math.round(secs / 3600)}h ago`
}
