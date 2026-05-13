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

  // "Copy this day to every weekday" shortcut. Recruiters complained about
  // editing 7 day rows individually when their schedule is the same Mon–Sun.
  // Source day's range list is cloned into every other day (including ones
  // currently toggled off — they get re-enabled).
  const copyDayToAll = (source: Weekday) => {
    const ranges = rules.workingHours[source]
    if (ranges.length === 0) return
    const cloned: Record<Weekday, typeof ranges> = {} as Record<Weekday, typeof ranges>
    for (const { key } of WEEKDAYS) {
      cloned[key] = ranges.map((r) => ({ ...r }))
    }
    update({ workingHours: cloned })
  }

  return (
    <div className="space-y-4 border border-surface-border rounded-[10px] p-4 bg-surface-light/40">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <NumberField
          label="Duration (min)"
          tooltip="How long each interview slot is. e.g. 30 means a candidate booking 9:00 takes the recruiter from 9:00 to 9:30."
          value={rules.durationMinutes} min={5} max={480}
          onChange={(v) => update({ durationMinutes: v })} />
        <NumberField
          label="Slot interval (min)"
          tooltip="How often a new slot starts on the picker grid. 30 → 9:00, 9:30, 10:00... Set this equal to Duration for back-to-back, no-overlap slots."
          value={rules.slotIntervalMinutes} min={5} max={480}
          onChange={(v) => update({ slotIntervalMinutes: v })} />
        <NumberField
          label="Buffer before (min)"
          tooltip="Padding the candidate must leave BEFORE any existing busy event. e.g. busy 14:00–15:00 with buffer-before 30 → no slot can end after 13:30."
          value={rules.bufferBeforeMinutes} min={0} max={480}
          onChange={(v) => update({ bufferBeforeMinutes: v })} />
        <NumberField
          label="Buffer after (min)"
          tooltip="Padding AFTER any busy event before another slot can start. e.g. busy 14:00–15:00 with buffer-after 15 → no slot can start before 15:15."
          value={rules.bufferAfterMinutes} min={0} max={480}
          onChange={(v) => update({ bufferAfterMinutes: v })} />
        <NumberField
          label="Min notice (hours)"
          tooltip="How far in advance candidates must book. e.g. 2 means no slots within the next 2 hours, so candidates can't book a meeting starting in 5 minutes."
          value={rules.minNoticeHours} min={0} max={720}
          onChange={(v) => update({ minNoticeHours: v })} />
        <NumberField
          label="Max days out"
          tooltip="Furthest a candidate can book ahead. 14 = picker only shows the next 14 days."
          value={rules.maxDaysOut} min={1} max={365}
          onChange={(v) => update({ maxDaysOut: v })} />
      </div>

      <div>
        <div className="eyebrow mb-2 flex items-center gap-1.5">
          Working hours (workspace timezone)
          <InfoIcon tooltip="The window each weekday when slots can be generated, in your workspace's timezone. Click a day name to toggle it off entirely. Add multiple ranges for split days (e.g. 09:00–12:00 and 13:00–17:00 to skip lunch)." />
        </div>
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
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => addRange(key)}
                        className="text-[11px] text-grey-35 hover:text-ink"
                      >
                        + add range
                      </button>
                      <button
                        type="button"
                        onClick={() => copyDayToAll(key)}
                        title={`Copy ${label}'s hours to every weekday`}
                        className="text-[11px] text-grey-35 hover:text-[color:var(--brand-primary)]"
                      >
                        copy to all days
                      </button>
                    </div>
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

function NumberField({ label, tooltip, value, min, max, onChange }: { label: string; tooltip?: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="eyebrow block mb-1 flex items-center gap-1">
        {label}
        {tooltip && <InfoIcon tooltip={tooltip} />}
      </span>
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

function InfoIcon({ tooltip }: { tooltip: string }) {
  return (
    <span
      className="relative inline-flex items-center group cursor-help align-middle"
      tabIndex={0}
      role="img"
      aria-label="Help"
    >
      <svg
        className="w-3.5 h-3.5 text-grey-50 hover:text-[color:var(--brand-primary)] transition-colors"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8h.01M11 12h1v4h1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span
        className="invisible group-hover:visible group-focus:visible opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-64 px-3 py-2 rounded-md bg-[#262626] text-white text-[12px] leading-snug normal-case font-normal tracking-normal shadow-lg pointer-events-none"
        style={{ letterSpacing: 'normal' }}
      >
        {tooltip}
        <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-[5px] border-transparent border-t-[#262626]" />
      </span>
    </span>
  )
}

function addHours(hhmm: string, h: number): string {
  const [hh, mm] = hhmm.split(':').map(Number)
  const total = (hh * 60 + mm) + h * 60
  const newH = Math.min(23, Math.floor(total / 60))
  const newM = total % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}
