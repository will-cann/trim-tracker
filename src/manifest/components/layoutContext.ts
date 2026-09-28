import { createContext } from 'react'

/**
 * How Screen/TopBar lay themselves out.
 * - phone: full-viewport column, max-w-md, fixed footer (default)
 * - wide: full-viewport column, wider max width (laptop load/settings pages)
 * - embedded: fills its parent pane; footer sticks to the pane bottom (laptop split view)
 */
export type LayoutVariant = 'phone' | 'wide' | 'embedded'
export const LayoutContext = createContext<LayoutVariant>('phone')
