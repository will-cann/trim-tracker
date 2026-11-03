import { splitTag, TAG_SUFFIX_LEN } from '../lib/metrc'

/**
 * Proper's pickers find a case by the last digits of its lot number, not by
 * the product name, so those digits are the biggest thing on a pick line.
 * Leading zeros inside the suffix are kept (so "…0008955" still reads as
 * seven characters) but muted so the eye lands on "8955".
 */

const SIZE = {
  md: 'text-h2',
  lg: 'text-display',
  xl: 'text-4xl font-black tracking-tight leading-none',
} as const

export function LotDigits({ tag, size = 'lg', className = '' }: { tag: string; size?: keyof typeof SIZE; className?: string }) {
  const { zeros, digits } = splitTag(tag)
  return (
    <span className={`font-mono tabular-nums text-gray-900 ${SIZE[size]} ${className}`} title={tag}>
      {zeros && <span className="text-gray-300">{zeros}</span>}
      {digits}
    </span>
  )
}

/** Full tag in monospace with the suffix a picker reads in bold. */
export function TagText({ tag, className = '' }: { tag: string; className?: string }) {
  const cut = Math.max(0, tag.length - TAG_SUFFIX_LEN)
  return (
    <span className={`font-mono tabular-nums break-all ${className}`}>
      <span className="text-gray-400">{tag.slice(0, cut)}</span>
      <span className="font-bold text-gray-900">{tag.slice(cut)}</span>
    </span>
  )
}
