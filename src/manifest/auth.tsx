import { useEffect, type ReactNode } from 'react'
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import { Loader2, LogIn } from 'lucide-react'
import { Button, Card, Notice } from './components/ui'
import { DEPLOY_NAME, ManifestAuthContext as Ctx } from './lib/authContext'
import { setTokenProvider } from './lib/authToken'

/**
 * Sign-in for the manifest picker. Same Auth0 application as the main UI, but
 * the picker lives at /manifest in its own bundle, so it has its own provider:
 * callbacks return to /manifest and tokens are cached in localStorage so a
 * reload on a phone mid-pick doesn't bounce through Auth0 again.
 *
 * The Netlify functions decide who may actually use the picker
 * (MANIFEST_COMPANY_IDS); this just gets a token.
 */

const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS_AUTH === 'true'

function returnTo(): string {
  return `${window.location.origin}/manifest`
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-gray-100 flex items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6 space-y-4 text-center">
        <img src="/logo.png" alt="" className="h-12 w-12 mx-auto" />
        <div>
          <h1 className="text-xl font-black text-gray-900">Manifest Picker</h1>
          {DEPLOY_NAME && <p className="text-xs text-gray-500 mt-1">{DEPLOY_NAME}</p>}
        </div>
        {children}
      </Card>
    </div>
  )
}

function Auth0Bridge({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, user, error, loginWithRedirect, logout, getAccessTokenSilently } = useAuth0()

  useEffect(() => {
    if (!isAuthenticated) return
    setTokenProvider(async () => {
      try {
        return await getAccessTokenSilently()
      } catch {
        return null
      }
    })
  }, [isAuthenticated, getAccessTokenSilently])

  if (isLoading) {
    return (
      <Frame>
        <p className="text-sm text-gray-500 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
        </p>
      </Frame>
    )
  }

  if (!isAuthenticated) {
    return (
      <Frame>
        {error && <Notice tone="red">{error.message}</Notice>}
        <p className="text-sm text-gray-600">Scanning, invoice reading and Metrc checks need a NeuroCann account.</p>
        <Button block onClick={() => void loginWithRedirect({ appState: { returnTo: '/manifest' } })}>
          <LogIn className="h-5 w-5" /> Sign in
        </Button>
      </Frame>
    )
  }

  return (
    <Ctx.Provider
      value={{
        email: user?.email ?? null,
        logout: () => void logout({ logoutParams: { returnTo: returnTo() } }),
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

function DevBypassBridge({ children }: { children: ReactNode }) {
  useEffect(() => {
    setTokenProvider(async () => 'dev-bypass-token')
  }, [])
  return <Ctx.Provider value={{ email: 'admin@greenvalley.com', logout: () => undefined }}>{children}</Ctx.Provider>
}

export function ManifestAuthProvider({ children }: { children: ReactNode }) {
  if (DEV_BYPASS) return <DevBypassBridge>{children}</DevBypassBridge>

  const domain = import.meta.env.VITE_AUTH0_DOMAIN
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID
  const audience = import.meta.env.VITE_AUTH0_AUDIENCE
  if (!domain || !clientId) {
    return (
      <Frame>
        <Notice tone="red">Sign-in is not configured on this build (VITE_AUTH0_DOMAIN / VITE_AUTH0_CLIENT_ID unset).</Notice>
      </Frame>
    )
  }

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      cacheLocation="localstorage"
      authorizationParams={{ redirect_uri: returnTo(), audience, scope: 'openid profile email' }}
      onRedirectCallback={() => window.history.replaceState({}, document.title, '/manifest')}
    >
      <Auth0Bridge>{children}</Auth0Bridge>
    </Auth0Provider>
  )
}
