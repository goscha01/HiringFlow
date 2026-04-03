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
    fetch('/api/platform/stats').then(r => r.json()).then(d => { setStats(d); setLoading(false) })
  }, [])

  if (loading || !stats) return <div className="text-center py-12 text-[#94a3b8]">Loading...</div>

  const cards = [
    { label: 'Total Users', value: stats.totalUsers, sub: `${stats.recentUsers} new this week` },
    { label: 'Workspaces', value: stats.totalWorkspaces, sub: `${stats.activeWorkspaces} active` },
    { label: 'Total Sessions', value: stats.totalSessions, sub: 'candidates' },
    { label: 'Flows', value: stats.totalFlows, sub: 'across all workspaces' },
    { label: 'Trainings', value: stats.totalTrainings, sub: 'across all workspaces' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Platform Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {cards.map(c => (
          <div key={c.label} className="bg-[#1e293b] rounded-lg border border-[#334155] p-5">
            <div className="text-3xl font-bold text-white">{c.value}</div>
            <div className="text-sm text-[#94a3b8] mt-1">{c.label}</div>
            <div className="text-xs text-[#64748b] mt-1">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Plan breakdown */}
      <div className="bg-[#1e293b] rounded-lg border border-[#334155] p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Subscription Plans</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.planBreakdown.map(p => (
            <div key={p.plan} className="bg-[#0f172a] rounded-lg p-4 border border-[#334155]">
              <div className="text-2xl font-bold text-white">{p.count}</div>
              <div className="text-sm text-[#94a3b8] capitalize">{p.plan}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
