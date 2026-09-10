import { useCallback, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'
const THEME_KEY = 'my-radio:theme'

/** Light/dark toggle. The initial value is whatever the inline script in
 * index.html already stamped onto <html data-theme> before first paint. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(
    () => (document.documentElement.dataset.theme as Theme) || 'light',
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // private browsing / disabled storage — the choice just won't persist
    }
  }, [theme])

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])
  return { theme, toggle }
}
