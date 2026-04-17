/**
 * Sparkline — inline SVG line chart used on Stat cards and table rows.
 * Port of Design/design_handoff_hirefunnel/ui.jsx `Sparkline`.
 */

import * as React from 'react'

export interface SparklineProps {
  data: number[]
  w?: number
  h?: number
  stroke?: string
  fill?: string
  className?: string
}

export function Sparkline({
  data,
  w = 120,
  h = 32,
  stroke = 'var(--brand-primary)',
  fill,
  className,
}: SparklineProps) {
  if (data.length < 2) {
    return <svg width={w} height={h} className={className} />
  }
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return [x, y] as const
  })
  const d = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ')
  const area = `${d} L${w},${h} L0,${h} Z`
  return (
    <svg width={w} height={h} className={className} style={{ display: 'block' }}>
      {fill && <path d={area} fill={fill} />}
      <path d={d} stroke={stroke} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
