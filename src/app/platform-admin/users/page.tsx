'use client'

import { useState, useEffect } from 'react'

interface UserRow {
  id: string; email: string; name: string | null; isSuperAdmin: boolean; createdAt: string
  workspaces: { id: string; name: string; plan: string; isActive: boolean; role: string }[]
}

export default function PlatformUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = () => {
    fetch('/api/platform/users').then(r => r.json()).then(d => { setUsers(d); setLoading(false) })
  }

  useEffect(() => { refresh() }, [])

  const toggleSuperAdmin = async (user: UserRow) => {
    await fetch(`/api/platform/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isSuperAdmin: !user.isSuperAdmin }),
    })
    refresh()
  }

  const deleteUser = async (user: UserRow) => {
    if (!confirm(`Delete user ${user.email}? This cannot be undone.`)) return
    await fetch(`/api/platform/users/${user.id}`, { method: 'DELETE' })
    refresh()
  }

  if (loading) return <div className="text-center py-12 text-[#94a3b8]">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Users ({users.length})</h1>
      </div>

      <div className="bg-[#1e293b] rounded-lg border border-[#334155] overflow-hidden">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-[#334155]">
              <th className="px-5 py-3 text-left text-xs font-medium text-[#64748b] uppercase">User</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-[#64748b] uppercase">Workspace</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-[#64748b] uppercase">Plan</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-[#64748b] uppercase">Role</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-[#64748b] uppercase">Joined</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-[#64748b] uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#334155]">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-[#334155]/30">
                <td className="px-5 py-4">
                  <div className="text-sm font-medium text-white">{u.name || u.email}</div>
                  <div className="text-xs text-[#64748b]">{u.email}</div>
                  {u.isSuperAdmin && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium mt-1 inline-block">Super Admin</span>
                  )}
                </td>
                <td className="px-5 py-4 text-sm text-[#94a3b8]">
                  {u.workspaces.map(w => w.name).join(', ') || '—'}
                </td>
                <td className="px-5 py-4">
                  {u.workspaces.map(w => (
                    <span key={w.id} className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                      w.plan === 'enterprise' ? 'bg-purple-500/20 text-purple-400' :
                      w.plan === 'pro' ? 'bg-blue-500/20 text-blue-400' :
                      w.plan === 'starter' ? 'bg-green-500/20 text-green-400' :
                      'bg-[#334155] text-[#94a3b8]'
                    }`}>
                      {w.plan}
                    </span>
                  ))}
                </td>
                <td className="px-5 py-4 text-sm text-[#94a3b8] capitalize">
                  {u.workspaces.map(w => w.role).join(', ') || '—'}
                </td>
                <td className="px-5 py-4 text-xs text-[#64748b]">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td className="px-5 py-4 text-right space-x-3">
                  <button
                    onClick={() => toggleSuperAdmin(u)}
                    className={`text-xs ${u.isSuperAdmin ? 'text-amber-400 hover:text-amber-300' : 'text-[#64748b] hover:text-white'}`}
                  >
                    {u.isSuperAdmin ? 'Remove SA' : 'Make SA'}
                  </button>
                  <button onClick={() => deleteUser(u)} className="text-xs text-red-400 hover:text-red-300">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
