import { useContext, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { LayoutContext, type LayoutVariant } from './layoutContext'

const WIDTH: Record<LayoutVariant, string> = { phone: 'max-w-md', wide: 'max-w-2xl', embedded: 'max-w-none' }

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-emerald-500 text-white hover:bg-emerald-600 active:bg-emerald-600 disabled:bg-gray-300 disabled:hover:bg-gray-300',
  secondary: 'bg-white text-gray-900 border border-gray-200 hover:bg-gray-50 active:bg-gray-100 disabled:text-gray-400',
  ghost: 'bg-transparent text-emerald-600 hover:bg-emerald-50 active:bg-emerald-50 disabled:text-gray-400',
  danger: 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 active:bg-red-100',
}

export function Button({
  variant = 'primary',
  block,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; block?: boolean }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 min-h-12 text-base font-bold select-none touch-manipulation transition-colors ${VARIANT[variant]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm ${className}`}>{children}</div>
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-label uppercase tracking-wide text-gray-500 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-gray-400 mt-1">{hint}</span>}
    </label>
  )
}

const CONTROL =
  'w-full rounded-xl border border-gray-200 bg-white px-3 min-h-12 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400'

export function Input(props: ComponentProps<'input'>) {
  return <input {...props} className={`${CONTROL} ${props.className ?? ''}`} />
}

export function Select(props: ComponentProps<'select'>) {
  return <select {...props} className={`${CONTROL} ${props.className ?? ''}`} />
}

export function TopBar({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string
  subtitle?: string
  onBack?: () => void
  right?: ReactNode
}) {
  const variant = useContext(LayoutContext)
  return (
    <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-200 pt-[env(safe-area-inset-top)]">
      <div className={`mx-auto ${WIDTH[variant]} flex items-center gap-2 px-3 h-14`}>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="-ml-1 h-10 w-10 inline-flex items-center justify-center rounded-full active:bg-gray-100 text-gray-700"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        ) : (
          <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-subhead truncate leading-tight">{title}</h1>
          {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
        </div>
        {right}
      </div>
    </header>
  )
}

export function Screen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const variant = useContext(LayoutContext)
  const embedded = variant === 'embedded'
  return (
    <div className={`${embedded ? 'h-full' : 'min-h-dvh'} flex flex-col bg-gray-100`}>
      <main className={`mx-auto w-full ${WIDTH[variant]} flex-1 px-3 py-3 ${embedded ? 'pb-3' : 'pb-28'} space-y-3`}>{children}</main>
      {footer && (
        <div
          className={`${embedded ? 'sticky' : 'fixed inset-x-0'} bottom-0 z-20 bg-white/95 backdrop-blur border-t border-gray-200 pb-[env(safe-area-inset-bottom)]`}
        >
          <div className={`mx-auto ${WIDTH[variant]} px-3 py-3 flex gap-2`}>{footer}</div>
        </div>
      )}
    </div>
  )
}

export function Pill({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'gray' | 'blue'; children: ReactNode }) {
  const t = {
    green: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
    gray: 'bg-gray-100 text-gray-600',
    blue: 'bg-blue-100 text-blue-700',
  }[tone]
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-micro ${t}`}>{children}</span>
}

export function Notice({ tone, children }: { tone: 'amber' | 'red' | 'green' | 'blue'; children: ReactNode }) {
  const t = {
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
  }[tone]
  return <div className={`rounded-xl border px-3 py-2 text-sm ${t}`}>{children}</div>
}
