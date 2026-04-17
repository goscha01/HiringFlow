/**
 * Platform admin dashboard. Dark chrome per design spec — kept intentionally
 * different from customer workspaces so staff can't confuse the two.
 */

'use client'

import { useState, useEffect } from 'react'

interface Stats {
  totalUsers: number; totalWorkspaces: number; activeWorkspaces: number
  totalSessions: number; totalFlows: number; totalTrainings: number; recentUsers: number
  planBreakdown: { plan: string; count: number }[]
}

export default function PlatformDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/platform/stats').then((r) => r.json()).then((d) => { setStats(d); setLoading(false) })
  }, [])

  if (loading || !stats) {
    return <div className="py-14 text-center font-mono text-[11px] uppercase text-[#94a3b8]" style={{ letterSpacing: '0.1em' }}>Loading…</div>
  }

  const cards = [
    { label: 'Total users',      value: stats.totalUsers,      sub: `${stats.recentUsers} new this week` },
    { label: 'Workspaces',       value: stats.totalWorkspaces, sub: `${stats.activeWorkspaces} active` },
    { label: 'Total sessions',   value: stats.totalSessions,   sub: 'candidates across all workspaces' },
    { label: 'Flows',            value: stats.totalFlows,      sub: 'across all workspaces' },
    { label: 'Trainings',        value: stats.totalTrainings,  sub: 'across all workspaces' },
  ]

  return (
    <div>
      <div className="mb-8">
        <div className="font-mono text-[11px] uppercase text-[#94a3b8] mb-1.5" style={{ letterSpacing: '0.12em' }}>
          Staff console
        </div>
        <h1 className="text-[26px] font-semibold text-white tracking-tight2">Platform dashboard</h1>
        <p className="text-[14px] text-[#94a3b8] mt-1">Aggregate metrics across every workspace.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="bg-[#1e293b] rounded-[14px] border border-[#334155] p-5">
            <div className="font-mono text-[10px] uppercase text-[#94a3b8] mb-2" style={{ letterSpacing: '0.1em' }}>
              {c.label}
            </div>
            <div className="text-[32px] font-semibold text-white leading-none tracking-tight2">{c.value}</div>
            <div className="text-[11px] text-[#64748b] mt-1.5">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="bg-[#1e293b] rounded-[14px] border border-[#334155] p-6">
        <div className="font-mono text-[10px] uppercase text-[#94a3b8] mb-1" style={{ letterSpacing: '0.1em' }}>Breakdown</div>
        <h2 className="text-[15px] font-semibold text-white mb-4">Subscription plans</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.planBreakdown.map((p) => (
            <div key={p.plan} className="bg-[#0f172a] rounded-[10px] p-4 border border-[#334155]">
              <div className="text-[24px] font-semibold text-white leading-none">{p.count}</div>
              <div className="text-[12px] text-[#94a3b8] capitalize mt-1">{p.plan}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
