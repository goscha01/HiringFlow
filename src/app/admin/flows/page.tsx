'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Flow {
  id: string
  name: string
  slug: string
  isPublished: boolean
  createdAt: string
  _count: {
    steps: number
    sessions: number
  }
}

export default function FlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([])
  const [showModal, setShowModal] = useState(false)
  const [newFlowName, setNewFlowName] = useState('')
  const [creating, setCreating] = useState(false)
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  useEffect(() => {
    fetchFlows()
  }, [])

  const fetchFlows = async () => {
    const res = await fetch('/api/flows')
    if (res.ok) {
      const data = await res.json()
      setFlows(data)
    }
  }

  const createFlow = async () => {
    if (!newFlowName.trim()) return

    setCreating(true)
    const res = await fetch('/api/flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFlowName }),
    })

    if (res.ok) {
      setNewFlowName('')
      setShowModal(false)
      fetchFlows()
    }
    setCreating(false)
  }

  const togglePublish = async (flow: Flow) => {
    const res = await fetch(`/api/flows/${flow.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublished: !flow.isPublished }),
    })
    if (res.ok) fetchFlows()
  }

  const copyShareUrl = (slug: string) => {
    const url = `${window.location.origin}/f/${slug}`
    navigator.clipboard.writeText(url)
    setCopiedSlug(slug)
    setTimeout(() => setCopiedSlug(null), 2000)
  }

  const deleteFlow = async (id: string) => {
    if (!confirm('Are you sure you want to delete this flow?')) return

    await fetch(`/api/flows/${id}`, { method: 'DELETE' })
    fetchFlows()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Flows</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
        >
          Create Flow
        </button>
      </div>

      {flows.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          No flows created yet. Create your first flow to get started.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Steps
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sessions
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {flows.map((flow) => (
                <tr key={flow.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{flow.name}</div>
                    <div className="text-sm text-gray-500">/{flow.slug}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {flow._count.steps}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {flow._count.sessions}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => togglePublish(flow)}
                      className={`px-2 py-1 text-xs rounded-full cursor-pointer transition-colors ${
                        flow.isPublished
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                      }`}
                    >
                      {flow.isPublished ? 'Published' : 'Draft'}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm space-x-3">
                    <Link
                      href={`/admin/flows/${flow.id}/builder`}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/admin/flows/${flow.id}/submissions`}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Submissions
                    </Link>
                    <button
                      onClick={() => copyShareUrl(flow.slug)}
                      className="text-green-600 hover:text-green-800"
                    >
                      {copiedSlug === flow.slug ? 'Copied!' : 'Share URL'}
                    </button>
                    <button
                      onClick={() => deleteFlow(flow.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold mb-4">Create New Flow</h2>
            <input
              type="text"
              value={newFlowName}
              onChange={(e) => setNewFlowName(e.target.value)}
              placeholder="Flow name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && createFlow()}
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={createFlow}
                disabled={creating || !newFlowName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
