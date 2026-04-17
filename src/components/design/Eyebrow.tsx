/**
 * Eyebrow — mono uppercase label used above titles, in table headers, and on
 * card labels. Signature move of the refreshed design system.
 */

import * as React from 'react'

export interface EyebrowProps {
  children: React.ReactNode
  size?: 'xs' | 'sm'        // 10px vs 11px — table headers vs PageHeader eyebrows
  className?: string
}

export function Eyebrow({ children, size = 'sm', className = '' }: EyebrowProps) {
  const sizeClass = size === 'xs' ? 'text-[10px]' : 'text-[11px]'
  const spacing = size === 'xs' ? { letterSpacing: '0.1em' } : { letterSpacing: '0.12em' }
  return (
    <div
      className={`font-mono ${sizeClass} uppercase text-grey-35 ${className}`.trim()}
      style={spacing}
    >
      {children}
    </div>
  )
}
