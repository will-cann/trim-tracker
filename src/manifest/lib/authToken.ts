/**
 * Bearer token source for every manifest-picker call to /.netlify/functions.
 * The Auth0 bridge in auth.tsx installs a provider once the user is signed in;
 * fetch helpers ask for a fresh token per request so a long picking session
 * survives token expiry. Calls made before the provider is installed (a child
 * effect firing in the same commit as the bridge's) wait for it.
 */

type TokenProvider = () => Promise<string | null>

let provider: TokenProvider | null = null
let signalInstalled: (() => void) | null = null
const installed = new Promise<void>((resolve) => {
  signalInstalled = resolve
})

export function setTokenProvider(p: TokenProvider) {
  provider = p
  signalInstalled?.()
}

export async function authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  await installed
  const token = await provider!()
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra
}
