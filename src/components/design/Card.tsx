/**
 * Card primitive — port of Design/design_handoff_hirefunnel/ui.jsx `Card`.
 * Default padding 20px, radius 14px, subtle border, warm background.
 */

import * as React from 'react'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: number | string
  noBorder?: boolean
}

export function Card({ padding = 20, noBorder, className = '', style, children, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={`bg-white rounded-[14px] ${noBorder ? '' : 'border border-surface-border'} ${className}`.trim()}
      style={{ padding, ...style }}
    >
      {children}
    </div>
  )
}
