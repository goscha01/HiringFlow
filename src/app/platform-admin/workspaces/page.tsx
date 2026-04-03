'use client'

import { useState, useEffect } from 'react'

interface WorkspaceRow {
  id: string; name: string; slug: string; plan: string; isActive: boolean; createdAt: string
  counts: { members: number; flows: number; sessions: number; trainings: number; ads: number }
}

const PLANS = ['free', 'starter', 'pro', 'enterprise']

export default function PlatformWorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = () => {
    fetch('/api/platform/workspaces').then(r => r.json()).then(d => { setWorkspaces(d); setLoading(false) })
  }

  useEffect(() => { refresh() }, [])

  const updateWorkspace = async (id: string, data: Record<string, unknown>) => {
    await fetch(`/api/platform/workspaces/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    refresh()
  }

  if (loading) return <div className="text-center py-12 text-[#94a3b8]">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Workspaces ({workspaces.length})</h1>
      </div>

      <div className="bg-[#1e293b] rounded-lg border border-[#334155] overflow-hidden">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-[#334155]">
              <th className="px-5 py-3 text-left text-xs font-medium text-[#64748b] uppercase">Workspace</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-[#64748b] uppercase">Plan</th>
              <th className="px-5 py-3 text-center text-xs font-medium text-[#64748b] uppercase">Members</th>
              <th className="px-5 py-3 text-center text-xs font-medium text-[#64748b] uppercase">Flows</th>
              <th className="px-5 py-3 text-center text-xs font-medium text-[#64748b] uppercase">Sessions</th>
              <th className="px-5 py-3 text-center text-xs font-medium text-[#64748b] uppercase">Trainings</th>
              <th className="px-5 py-3 text-center text-xs font-medium text-[#64748b] uppercase">Ads</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-[#64748b] uppercase">Status</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-[#64748b] uppercase">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#334155]">
            {workspaces.map(w => (
              <tr key={w.id} className="hover:bg-[#334155]/30">
                <td className="px-5 py-4">
                  <div className="text-sm font-medium text-white">{w.name}</div>
                  <div className="text-xs text-[#64748b]">{w.slug}</div>
                </td>
                <td className="px-5 py-4">
                  <select
                    value={w.plan}
                    onChange={(e) => updateWorkspace(w.id, { plan: e.target.value })}
                    className="bg-[#0f172a] text-[#94a3b8] text-xs px-2 py-1 rounded border border-[#334155] capitalize"
                  >
                    {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </td>
                <td className="px-5 py-4 text-sm text-[#94a3b8] text-center">{w.counts.members}</td>
                <td className="px-5 py-4 text-sm text-[#94a3b8] text-center">{w.counts.flows}</td>
                <td className="px-5 py-4 text-sm text-white font-medium text-center">{w.counts.sessions}</td>
                <td className="px-5 py-4 text-sm text-[#94a3b8] text-center">{w.counts.trainings}</td>
                <td className="px-5 py-4 text-sm text-[#94a3b8] text-center">{w.counts.ads}</td>
                <td className="px-5 py-4">
                  <button
                    onClick={() => updateWorkspace(w.id, { isActive: !w.isActive })}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      w.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {w.isActive ? 'Active' : 'Disabled'}
                  </button>
                </td>
                <td className="px-5 py-4 text-xs text-[#64748b]">
                  {new Date(w.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
