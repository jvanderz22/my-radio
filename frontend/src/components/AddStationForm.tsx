import { useRef, useState } from 'react'

const inputClass =
  'min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm ' +
  'placeholder:text-neutral-400 focus-visible:outline-2 focus-visible:outline-offset-0 ' +
  'focus-visible:outline-indigo-500 dark:border-neutral-700 dark:bg-neutral-900 ' +
  'dark:placeholder:text-neutral-500'

interface Props {
  /** Resolves true when the station was added, so the form can reset. */
  onAdd: (name: string, streamUrl: string) => Promise<boolean>
}

export function AddStationForm({ onAdd }: Props) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const ok = await onAdd(name.trim(), url.trim())
    setBusy(false)
    if (ok) {
      setName('')
      setUrl('')
      nameRef.current?.focus()
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap gap-2 rounded-2xl border border-neutral-200 bg-white/60 p-3 dark:border-neutral-800 dark:bg-neutral-900/40"
    >
      <input
        ref={nameRef}
        className={inputClass}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Station name"
        required
      />
      <input
        className={`${inputClass} basis-full sm:basis-auto`}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        type="url"
        placeholder="https://stream-url…"
        required
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50"
      >
        Add
      </button>
    </form>
  )
}
