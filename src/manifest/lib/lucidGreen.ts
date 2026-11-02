/**
 * Lucid Green QR codes. Proper's cases carry two labels: the blue Metrc tag
 * (Code 128, what the picker needs) and a white "ENHANCED CASE ID, powered by
 * Lucid Green" label on the front with a QR code. The QR is the one a picker
 * sees first, so a mis-scan of it has to be explained, not just rejected.
 *
 *   CaseID  (on the case)        https://qr.lcdg.io/c/<id>   also /case/<id>
 *   LucidID (on each unit inside) https://qr.lcdg.io/<id>
 *
 * Domain is lcdg.io or lucidgreen.io or any subdomain, http or https, optional
 * trailing slash. https://docs.lucidgreen.io/lucidids.html
 */
export type LucidCode = { kind: 'case' | 'item'; id: string }

const LUCID_URL = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:lcdg\.io|lucidgreen\.io)\/(?:(c|case)\/)?([A-Za-z0-9]{6,40})\/?$/i

export function parseLucidCode(raw: string): LucidCode | null {
  const m = raw.trim().match(LUCID_URL)
  if (!m) return null
  return { kind: m[1] ? 'case' : 'item', id: m[2] }
}
