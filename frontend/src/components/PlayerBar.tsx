import { IconButton } from './IconButton'
import { PauseIcon, PlayIcon, RadioIcon, StopIcon } from './icons'
import { trackText } from '../format'
import type { Station } from '../types'

interface Props {
  audioRef: React.RefObject<HTMLAudioElement | null>
  station: Station | undefined
  paused: boolean
  onToggle: () => void
  onStop: () => void
}

export function PlayerBar({ audioRef, station, paused, onToggle, onStop }: Props) {
  return (
    <div className="sticky bottom-3 z-10 mt-4 rounded-2xl border border-neutral-200 bg-white/85 p-3 shadow-lg shadow-neutral-900/5 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/85 dark:shadow-black/30">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={!station}
          aria-label={paused ? 'Play' : 'Pause'}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-40"
        >
          {paused ? <PlayIcon className="size-5 translate-x-px" /> : <PauseIcon className="size-5" />}
        </button>

        <div className="min-w-0 flex-1">
          {station ? (
            <>
              <div className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                {station.name}
              </div>
              <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                {trackText(station)}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm text-neutral-400 dark:text-neutral-500">
              <RadioIcon className="size-4" />
              Nothing playing
            </div>
          )}
        </div>

        {station && (
          <IconButton label="Stop" onClick={onStop}>
            <StopIcon className="size-4" />
          </IconButton>
        )}
      </div>

      <audio ref={audioRef} className="mt-3" controls preload="none" />
    </div>
  )
}
