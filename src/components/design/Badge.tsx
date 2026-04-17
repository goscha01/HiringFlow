/**
 * Badge primitive — port of Design/design_handoff_hirefunnel/ui.jsx `Badge`.
 *
 * Mono uppercase chip with a colored dot. Tones map directly to the status
 * palette in the README (success / warn / danger / info / brand / neutral).
 */

import * as React from 'react'

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warn' | 'danger' | 'info'

export interface BadgeProps {
  tone?: BadgeTone
  children: React.ReactNode
  className?: string
}

const TONE: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: 'var(--neutral-bg)', fg: 'var(--neutral-fg)' },
  brand:   { bg: 'var(--brand-dim)',  fg: 'var(--brand-fg)'   },
  success: { bg: 'var(--success-bg)', fg: 'var(--success-fg)' },
  warn:    { bg: 'var(--warn-bg)',    fg: 'var(--warn-fg)'    },
  danger:  { bg: 'var(--danger-bg)',  fg: 'var(--danger-fg)'  },
  info:    { bg: 'var(--info-bg)',    fg: 'var(--info-fg)'    },
}

export function Badge({ tone = 'neutral', children, className = '' }: BadgeProps) {
  const t = TONE[tone]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold uppercase whitespace-nowrap ${className}`}
      style={{ background: t.bg, color: t.fg, letterSpacing: '0.04em' }}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full opacity-80" style={{ background: 'currentColor' }} />
      {children}
    </span>
  )
}
