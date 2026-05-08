'use client'

/**
 * Inline editor for SchedulingConfig.bookingRules.
 * Lives inside the create/edit modal on the Scheduling page when
 * `useBuiltInScheduler` is on. Keeps its own local state and emits the
 * validated shape via onChange.
 */

import { useEffect, useState } from 'react'
import { defaultBookingRules, type BookingRules, type Weekday } from '@/lib/scheduling/booking-rules'

interface Props {
  value: BookingRules | null
  onChange: (next: BookingRules) => void
}

const WEEKDAYS: { key: Weekday; label: string }[] = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
]

export function BookingRulesEditor({ value, onChange }: Props) {
  const [rules, setRules] = useState<BookingRules>(value ?? defaultBookingRules())

  useEffect(() => {
    setRules(value ?? defaultBookingRules())
  }, [value])

  const update = (patch: Partial<BookingRules>) => {
    const next = { ...rules, ...patch }
    setRules(next)
    onChange(next)
  }

  const setDayRange = (day: Weekday, idx: number, key: 'start' | 'end', val: string) => {
    const ranges = [...(rules.workingHours[day] || [])]
    ranges[idx] = { ...ranges[idx], [key]: val }
    update({ workingHours: { ...rules.workingHours, [day]: ranges } })
  }
  const toggleDay = (day: Weekday) => {
    const cur = rules.workingHours[day]
    const next = cur.length === 0 ? [{ start: '09:00', end: '17:00' }] : []
    update({ workingHours: { ...rules.workingHours, [day]: next } })
  }
  const addRange = (day: Weekday) => {
    const cur = rules.workingHours[day]
    const last = cur[cur.length - 1]
    const startDefault = last ? last.end : '09:00'
    update({
      workingHours: {
        ...rules.workingHours,
        [day]: [...cur, { start: startDefault, end: addHours(startDefault, 1) }],
      },
    })
  }
  const removeRange = (day: Weekday, idx: number) => {
    const cur = rules.workingHours[day].filter((_, i) => i !== idx)
    update({ workingHours: { ...rules.workingHours, [day]: cur } })
  }

  return (
    <div className="space-y-4 border border-surface-border rounded-[10px] p-4 bg-surface-light/40">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <NumberField label="Duration (min)" value={rules.durationMinutes} min={5} max={480}
          onChange={(v) => update({ durationMinutes: v })} />
        <NumberField label="Slot interval (min)" value={rules.slotIntervalMinutes} min={5} max={480}
          onChange={(v) => update({ slotIntervalMinutes: v })} />
        <NumberField label="Buffer before (min)" value={rules.bufferBeforeMinutes} min={0} max={480}
          onChange={(v) => update({ bufferBeforeMinutes: v })} />
        <NumberField label="Buffer after (min)" value={rules.bufferAfterMinutes} min={0} max={480}
          onChange={(v) => update({ bufferAfterMinutes: v })} />
        <NumberField label="Min notice (hours)" value={rules.minNoticeHours} min={0} max={720}
          onChange={(v) => update({ minNoticeHours: v })} />
        <NumberField label="Max days out" value={rules.maxDaysOut} min={1} max={365}
          onChange={(v) => update({ maxDaysOut: v })} />
      </div>

      <div>
        <div className="eyebrow mb-2">Working hours (workspace timezone)</div>
        <div className="space-y-1.5">
          {WEEKDAYS.map(({ key, label }) => {
            const ranges = rules.workingHours[key]
            const enabled = ranges.length > 0
            return (
              <div key={key} className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => toggleDay(key)}
                  className="w-12 text-left text-[12px] font-medium text-ink shrink-0 pt-1"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={`w-3 h-3 rounded-sm border ${enabled ? 'bg-[color:var(--brand-primary)] border-[color:var(--brand-primary)]' : 'bg-white border-surface-border'}`}
                    />
                    {label}
                  </span>
                </button>
                <div className="flex-1 space-y-1.5">
                  {ranges.length === 0 && (
                    <div className="text-[12px] text-grey-50 pt-1">Off</div>
                  )}
                  {ranges.map((r, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="time"
                        value={r.start}
                        onChange={(e) => setDayRange(key, idx, 'start', e.target.value)}
                        className="px-2 py-1 border border-surface-border rounded-[6px] text-[12px] text-ink"
                      />
                      <span className="text-grey-50 text-[12px]">–</span>
                      <input
                        type="time"
                        value={r.end}
                        onChange={(e) => setDayRange(key, idx, 'end', e.target.value)}
                        className="px-2 py-1 border border-surface-border rounded-[6px] text-[12px] text-ink"
                      />
                      <button
                        type="button"
                        onClick={() => removeRange(key, idx)}
                        className="text-[11px] text-grey-50 hover:text-[color:var(--danger-fg)]"
                      >
                        remove
                      </button>
                    </div>
                  ))}
                  {enabled && (
                    <button
                      type="button"
                      onClick={() => addRange(key)}
                      className="text-[11px] text-grey-35 hover:text-ink"
                    >
                      + add range
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="eyebrow block mb-1">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10)
          if (Number.isFinite(n)) onChange(n)
        }}
        className="w-full px-2 py-1.5 border border-surface-border rounded-[6px] text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-brand-500/40"
      />
    </label>
  )
}

function addHours(hhmm: string, h: number): string {
  const [hh, mm] = hhmm.split(':').map(Number)
  const total = (hh * 60 + mm) + h * 60
  const newH = Math.min(23, Math.floor(total / 60))
  const newM = total % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}
