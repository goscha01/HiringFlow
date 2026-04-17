/**
 * PageHeader primitive — port of Design/design_handoff_hirefunnel/ui.jsx.
 *
 * Mono uppercase eyebrow, 26px semibold title, optional description, and
 * right-aligned actions slot. Shared chrome across every admin screen.
 */

import * as React from 'react'

export interface PageHeaderProps {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({ eyebrow, title, description, actions, className = '' }: PageHeaderProps) {
  return (
    <div className={`px-8 pt-7 pb-5 border-b border-surface-divider flex flex-wrap items-end justify-between gap-6 ${className}`.trim()}>
      <div>
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="h-display m-0">{title}</h1>
        {description && (
          <p className="mt-1.5 text-[14px] text-grey-35 max-w-[620px]">{description}</p>
        )}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  )
}
