import { createContext, useContext } from 'react'

/** Optional label so people can tell deploys apart (e.g. "Proper Cannabis"). */
export const DEPLOY_NAME: string = import.meta.env.VITE_MANIFEST_DEPLOY_NAME ?? ''

export interface ManifestAuthState {
  email: string | null
  logout: () => void
}

export const ManifestAuthContext = createContext<ManifestAuthState | null>(null)

export function useManifestAuth(): ManifestAuthState {
  const c = useContext(ManifestAuthContext)
  if (!c) throw new Error('useManifestAuth must be used inside ManifestAuthProvider')
  return c
}
