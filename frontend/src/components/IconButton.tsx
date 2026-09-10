import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
}

/** A small square ghost button holding a single icon. `label` becomes both the
 * tooltip and the accessible name. */
export function IconButton({ label, children, className = '', ...rest }: Props) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={
        'inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 ' +
        'transition-colors hover:bg-neutral-200/70 hover:text-neutral-900 ' +
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ' +
        'disabled:pointer-events-none disabled:opacity-30 ' +
        'dark:text-neutral-400 dark:hover:bg-neutral-700/60 dark:hover:text-neutral-50 ' +
        className
      }
      {...rest}
    >
      {children}
    </button>
  )
}
