import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'

export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false)
  const [matches, setMatches] = useState(get)
  useEffect(() => {
    if (!window.matchMedia) return
    const media = window.matchMedia(query)
    const listener = () => setMatches(media.matches)
    listener()
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [query])
  return matches
}

/** Per-browser UI preference (sidebar collapsed, view mode). Never used for data. */
export function useLocalPreference<T extends string | boolean>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(`pruspect:${key}`)
      if (stored === null) return initial
      return (typeof initial === 'boolean' ? stored === 'true' : stored) as T
    } catch {
      return initial
    }
  })
  const update = useCallback(
    (next: T) => {
      setValue(next)
      try {
        window.localStorage.setItem(`pruspect:${key}`, String(next))
      } catch {
        // storage unavailable (private mode) — keep in memory only
      }
    },
    [key],
  )
  return [value, update] as const
}

/** Read/write a set of URL query params as state, so filters survive reloads and links. */
export function useQueryState<K extends string>(defaults: Record<K, string>) {
  const [params, setParams] = useSearchParams()
  const values = Object.fromEntries(
    (Object.keys(defaults) as K[]).map((key) => [key, params.get(key) ?? defaults[key]]),
  ) as Record<K, string>

  const update = useCallback(
    (patch: Partial<Record<K, string>>, options: { resetPage?: boolean } = { resetPage: true }) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(patch) as [K, string | undefined][]) {
            if (value === undefined || value === '' || value === defaults[key]) next.delete(key)
            else next.set(key, value)
          }
          if (options.resetPage && !('page' in patch)) next.delete('page')
          return next
        },
        { replace: true },
      )
    },
    [setParams, defaults],
  )
  return [values, update] as const
}
