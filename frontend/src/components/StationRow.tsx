import { memo } from 'react'
import { IconButton } from './IconButton'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  StopIcon,
  TrashIcon,
} from './icons'
import { ago, trackText } from '../format'
import type { Station } from '../types'

interface Props {
  station: Station
  index: number
  total: number
  isCurrent: boolean
  isPaused: boolean
  onPlay: () => void
  onToggle: () => void
  onStop: () => void
  onMove: (delta: -1 | 1) => void
  onRename: () => void
  onDelete: () => void
}

function StationRowImpl({
  station,
  index,
  total,
  isCurrent,
  isPaused,
  onPlay,
  onToggle,
  onStop,
  onMove,
  onRename,
  onDelete,
}: Props) {
  const live = station.np_status === 'ok'
  const dim = station.np_status != null && station.np_status !== 'ok'
  const fetchedAgo = ago(station.np_fetched_at)

  return (
    <li
      className={
        'flex items-center gap-3 rounded-2xl border p-3 transition-colors ' +
        (isCurrent
          ? 'border-indigo-300 bg-indigo-50/70 dark:border-indigo-500/40 dark:bg-indigo-500/10'
          : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700')
      }
    >
      <button
        type="button"
        onClick={isCurrent ? onToggle : onPlay}
        aria-label={isCurrent ? (isPaused ? 'Resume' : 'Pause') : `Play ${station.name}`}
        className={
          'inline-flex size-11 shrink-0 items-center justify-center rounded-full transition ' +
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ' +
          (isCurrent && !isPaused
            ? 'bg-indigo-600 text-white hover:bg-indigo-500'
            : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700')
        }
      >
        {isCurrent && !isPaused ? (
          <PauseIcon className="size-5" />
        ) : (
          <PlayIcon className="size-5 translate-x-px" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div
          className={
            'truncate text-sm ' +
            (isCurrent
              ? 'font-semibold text-neutral-900 dark:text-neutral-50'
              : 'font-medium text-neutral-800 dark:text-neutral-100')
          }
        >
          {station.name}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          {live && (
            <span className="relative flex size-1.5 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
            </span>
          )}
          <span className={'truncate ' + (dim ? 'italic opacity-70' : '')}>
            {trackText(station)}
          </span>
          {fetchedAgo && (
            <span className="shrink-0 text-neutral-400 dark:text-neutral-600">· {fetchedAgo}</span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center">
        {isCurrent && (
          <IconButton label="Stop" onClick={onStop}>
            <StopIcon className="size-4" />
          </IconButton>
        )}
        <IconButton label="Move up" onClick={() => onMove(-1)} disabled={index === 0}>
          <ChevronUpIcon className="size-4" />
        </IconButton>
        <IconButton label="Move down" onClick={() => onMove(1)} disabled={index === total - 1}>
          <ChevronDownIcon className="size-4" />
        </IconButton>
        <IconButton label="Rename" onClick={onRename}>
          <PencilIcon className="size-4" />
        </IconButton>
        <IconButton label="Delete" onClick={onDelete}>
          <TrashIcon className="size-4" />
        </IconButton>
      </div>
    </li>
  )
}

export const StationRow = memo(StationRowImpl)
