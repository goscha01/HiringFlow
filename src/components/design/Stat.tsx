/**
 * Stat primitive — headline metric card used on Dashboard + Analytics.
 * Port of Design/design_handoff_hirefunnel/ui.jsx `Stat`.
 */

import * as React from 'react'
import { Card } from './Card'
import { Badge, type BadgeTone } from './Badge'

export interface StatProps {
  label: string
  value: React.ReactNode
  delta?: React.ReactNode
  deltaTone?: BadgeTone
  sub?: React.ReactNode
  chart?: React.ReactNode
  className?: string
}

export function Stat({ label, value, delta, deltaTone = 'success', sub, chart, className = '' }: StatProps) {
  return (
    <Card className={className}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="eyebrow-sm">{label}</div>
        {delta && <Badge tone={deltaTone}>{delta}</Badge>}
      </div>
      <div className="text-[32px] font-semibold leading-none tracking-tight2 text-ink">{value}</div>
      {sub && <div className="text-[12px] text-grey-35 mt-1.5">{sub}</div>}
      {chart && <div className="mt-3">{chart}</div>}
    </Card>
  )
}
