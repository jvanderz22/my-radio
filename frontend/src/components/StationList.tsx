import { StationRow } from './StationRow'
import type { Station } from '../types'

interface Props {
  stations: Station[]
  playingId: number | null
  paused: boolean
  onPlay: (s: Station) => void
  onToggle: () => void
  onStop: () => void
  onMove: (id: number, delta: -1 | 1) => void
  onRename: (s: Station) => void
  onDelete: (s: Station) => void
}

export function StationList({
  stations,
  playingId,
  paused,
  onPlay,
  onToggle,
  onStop,
  onMove,
  onRename,
  onDelete,
}: Props) {
  if (stations.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        No stations yet — add one above.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {stations.map((s, i) => (
        <StationRow
          key={s.id}
          station={s}
          index={i}
          total={stations.length}
          isCurrent={s.id === playingId}
          isPaused={paused}
          onPlay={() => onPlay(s)}
          onToggle={onToggle}
          onStop={onStop}
          onMove={(delta) => onMove(s.id, delta)}
          onRename={() => onRename(s)}
          onDelete={() => onDelete(s)}
        />
      ))}
    </ul>
  )
}
