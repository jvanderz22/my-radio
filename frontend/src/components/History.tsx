import type { HistoryEntry } from '../types'

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export function History({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) return null

  return (
    <section className="mt-2">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        Recently played
      </h2>
      <ul className="max-h-44 space-y-1 overflow-y-auto pr-1 text-sm">
        {entries.map((h, i) => (
          <li key={`${h.when}-${i}`} className="flex gap-3">
            <span className="shrink-0 tabular-nums text-neutral-400 dark:text-neutral-600">
              {time(h.when)}
            </span>
            <span className="truncate text-neutral-600 dark:text-neutral-300">
              {h.track} <span className="text-neutral-400 dark:text-neutral-600">— {h.stationName}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
