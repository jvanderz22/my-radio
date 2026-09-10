import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const VOLUME_STEP = 0.05

export interface AudioController {
  /** Attach to the <audio> element that lives in the player bar. */
  ref: React.RefObject<HTMLAudioElement | null>
  play: (url: string) => void
  stop: () => void
  toggle: () => void
  nudgeVolume: (direction: 1 | -1) => void
  /** Whether a source is currently loaded (used to decide play vs. toggle). */
  hasSource: () => boolean
}

/** Wraps the single <audio> element: keeps a `paused` flag in sync with the
 * element's own events, and swallows the routine "interrupted by pause()"
 * AbortError that a quick station switch produces. The imperative methods keep
 * a stable identity so effects that depend on them don't re-run on every
 * play/pause. */
export function useAudio(onError: (message: string) => void): {
  controller: AudioController
  paused: boolean
} {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [paused, setPaused] = useState(true)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const sync = () => setPaused(el.paused)
    for (const ev of ['play', 'pause', 'ended'] as const) el.addEventListener(ev, sync)
    return () => {
      for (const ev of ['play', 'pause', 'ended'] as const) el.removeEventListener(ev, sync)
    }
  }, [])

  const safePlay = useCallback(() => {
    ref.current?.play().catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return
      onError(`play error: ${(err as Error).message}`)
    })
  }, [onError])

  const play = useCallback(
    (url: string) => {
      const el = ref.current
      if (!el) return
      el.src = url
      safePlay()
    },
    [safePlay],
  )

  const stop = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.pause()
    el.removeAttribute('src')
    el.load()
  }, [])

  const toggle = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (el.paused) safePlay()
    else el.pause()
  }, [safePlay])

  const nudgeVolume = useCallback((direction: 1 | -1) => {
    const el = ref.current
    if (!el) return
    el.volume = Math.min(1, Math.max(0, el.volume + direction * VOLUME_STEP))
  }, [])

  const hasSource = useCallback(() => !!ref.current?.src, [])

  // Stable across renders (all methods are useCallback-stable), so effects that
  // depend on the controller are set up once. `paused` is returned separately.
  const controller = useMemo<AudioController>(
    () => ({ ref, play, stop, toggle, nudgeVolume, hasSource }),
    [play, stop, toggle, nudgeVolume, hasSource],
  )

  return { controller, paused }
}
