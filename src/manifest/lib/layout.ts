import { useEffect, useState } from 'react'
import type { LayoutPreference } from './storage'

export const LAPTOP_QUERY = '(min-width: 1024px)'

export type LayoutMode = 'phone' | 'laptop'

function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches
}

/** `?layout=phone|laptop` in the URL wins for a session (handy for testing), then the saved preference, then screen width. */
export function resolveLayout(pref: LayoutPreference, wide: boolean, search = typeof window !== 'undefined' ? window.location.search : ''): LayoutMode {
  const fromUrl = new URLSearchParams(search).get('layout')
  if (fromUrl === 'phone' || fromUrl === 'laptop') return fromUrl
  if (pref !== 'auto') return pref
  return wide ? 'laptop' : 'phone'
}

export function useLayoutMode(pref: LayoutPreference): LayoutMode {
  const [wide, setWide] = useState(() => matches(LAPTOP_QUERY))
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(LAPTOP_QUERY)
    const onChange = (e: MediaQueryListEvent) => setWide(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return resolveLayout(pref, wide)
}
