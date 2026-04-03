'use client'

import { useState, useEffect } from 'react'

interface FunnelData {
  started: number; completed: number; passed: number
  trainingStarted: number; trainingCompleted: number
  invitedToSchedule: number; scheduled: number
}
interface SourceRow {
  source: string; started: number; completed: number; passed: number
  trainingCompleted: number; invitedToSchedule: number; scheduled: number
}
interface AdRow {
  adId: string; adName: string; source: string
  started: number; completed: number; passed: number
  trainingCompleted: number; invitedToSchedule: number; scheduled: number
}
interface AnalyticsData { funnel: FunnelData; sources: SourceRow[]; ads: AdRow[] }

const RANGES = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
]

function pct(a: number, b: number) {
  if (b === 0) return '—'
  return `${Math.round((a / b) * 100)}%`
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState('all')
  const [tab, setTab] = useState<'funnel' | 'sources' | 'ads'>('funnel')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/analytics?range=${range}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [range])

  if (loading || !data) return <div className="text-center py-12 text-grey-40">Loading analytics...</div>

  const { funnel, sources, ads } = data

  const stages = [
    { label: 'Started', value: funnel.started, color: '#94a3b8' },
    { label: 'Completed', value: funnel.completed, color: '#60a5fa' },
    { label: 'Passed', value: funnel.passed, color: '#34d399' },
    { label: 'Training Started', value: funnel.trainingStarted, color: '#a78bfa' },
    { label: 'Training Done', value: funnel.trainingCompleted, color: '#818cf8' },
    { label: 'Invited to Schedule', value: funnel.invitedToSchedule, color: '#f472b6' },
    { label: 'Scheduled', value: funnel.scheduled, color: '#FF9500' },
  ]

  const maxVal = Math.max(...stages.map(s => s.value), 1)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[36px] font-semibold text-grey-15">Analytics</h1>
          <p className="text-grey-35 mt-1">Track your hiring funnel performance</p>
        </div>
        <div className="flex gap-1 bg-surface rounded-[8px] p-1 border border-surface-border">
          {RANGES.map(r => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-4 py-2 text-xs rounded-[6px] font-medium transition-colors ${
                range === r.value ? 'bg-white text-grey-15 shadow-sm' : 'text-grey-40 hover:text-grey-20'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-surface-border">
        {[
          { key: 'funnel' as const, label: 'Funnel' },
          { key: 'sources' as const, label: 'Sources' },
          { key: 'ads' as const, label: 'Ads' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-grey-40 hover:text-grey-20'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* FUNNEL TAB */}
      {tab === 'funnel' && (
        <div>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-8">
            {stages.map(s => (
              <div key={s.label} className="bg-white rounded-[8px] border border-surface-border p-4">
                <div className="text-[28px] font-bold text-grey-15">{s.value}</div>
                <div className="text-xs text-grey-40 mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Visual funnel */}
          <div className="bg-white rounded-[12px] border border-surface-border p-8">
            <h3 className="text-lg font-semibold text-grey-15 mb-6">Candidate Funnel</h3>
            <div className="space-y-3">
              {stages.map((s, i) => (
                <div key={s.label} className="flex items-center gap-4">
                  <div className="w-40 text-sm text-grey-35 text-right flex-shrink-0">{s.label}</div>
                  <div className="flex-1 h-10 bg-surface rounded-[6px] relative overflow-hidden">
                    <div
                      className="h-full rounded-[6px] transition-all duration-500 flex items-center px-3"
                      style={{ width: `${Math.max((s.value / maxVal) * 100, s.value > 0 ? 8 : 0)}%`, backgroundColor: s.color }}
                    >
                      {s.value > 0 && <span className="text-white text-sm font-medium">{s.value}</span>}
                    </div>
                  </div>
                  <div className="w-16 text-xs text-grey-40 flex-shrink-0">
                    {i > 0 ? pct(s.value, stages[i - 1].value) : ''}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-grey-50 mt-6">Session-based metrics. Percentages show conversion from previous stage.</p>
          </div>
        </div>
      )}

      {/* SOURCES TAB */}
      {tab === 'sources' && (
        <div className="bg-white rounded-[12px] border border-surface-border overflow-hidden">
          {sources.length === 0 ? (
            <div className="text-center py-16 text-grey-40">No source data yet</div>
          ) : (
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-surface-border bg-surface">
                  <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Source</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Started</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Completed</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Passed</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Training Done</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Invited</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Scheduled</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Pass Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {sources.map(s => (
                  <tr key={s.source} className="hover:bg-surface-light">
                    <td className="px-5 py-4 text-sm font-medium text-grey-15 capitalize">{s.source}</td>
                    <td className="px-5 py-4 text-sm text-grey-15 text-right font-medium">{s.started}</td>
                    <td className="px-5 py-4 text-sm text-grey-35 text-right">{s.completed}</td>
                    <td className="px-5 py-4 text-sm text-grey-35 text-right">{s.passed}</td>
                    <td className="px-5 py-4 text-sm text-grey-35 text-right">{s.trainingCompleted}</td>
                    <td className="px-5 py-4 text-sm text-grey-35 text-right">{s.invitedToSchedule}</td>
                    <td className="px-5 py-4 text-sm text-grey-35 text-right">{s.scheduled}</td>
                    <td className="px-5 py-4 text-sm text-right">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        s.started > 0 && s.passed / s.started > 0.5 ? 'bg-green-100 text-green-700' :
                        s.started > 0 ? 'bg-brand-50 text-brand-600' : 'text-grey-40'
                      }`}>
                        {pct(s.passed, s.started)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ADS TAB */}
      {tab === 'ads' && (
        <div className="bg-white rounded-[12px] border border-surface-border overflow-hidden">
          {ads.length === 0 ? (
            <div className="text-center py-16 text-grey-40">No ad data yet</div>
          ) : (
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-surface-border bg-surface">
                  <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Ad</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Source</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Started</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Completed</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Passed</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Training Done</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Invited</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Scheduled</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Completion %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {ads.map(a => (
                  <tr key={a.adId} className="hover:bg-surface-light">
                    <td className="px-5 py-4 text-sm font-medium text-grey-15">{a.adName}</td>
                    <td className="px-5 py-4">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 font-medium capitalize">{a.source}</span>
                    </td>
                    <td className="px-5 py-4 text-sm text-grey-15 text-right font-medium">{a.started}</td>
                    <td className="px-5 py-4 text-sm text-grey-35 text-right">{a.completed}</td>
                    <td className="px-5 py-4 text-sm text-grey-35 text-right">{a.passed}</td>
                    <td className="px-5 py-4 text-sm text-grey-35 text-right">{a.trainingCompleted}</td>
                    <td className="px-5 py-4 text-sm text-grey-35 text-right">{a.invitedToSchedule}</td>
                    <td className="px-5 py-4 text-sm text-grey-35 text-right">{a.scheduled}</td>
                    <td className="px-5 py-4 text-sm text-right">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        a.started > 0 && a.completed / a.started > 0.5 ? 'bg-green-100 text-green-700' :
                        a.started > 0 ? 'bg-brand-50 text-brand-600' : 'text-grey-40'
                      }`}>
                        {pct(a.completed, a.started)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
