'use client'

import { useEffect, useState } from 'react'

interface Note {
  id: string
  body: string
  authorId: string | null
  authorName: string | null
  createdAt: string
  updatedAt: string
}

interface Props {
  candidateId: string
}

function formatRelative(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  const m = Math.round(ms / 60_000)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

export function NotesPanel({ candidateId }: Props) {
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const load = () => {
    fetch(`/api/candidates/${candidateId}/notes`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setNotes)
      .catch(() => setNotes([]))
  }

  useEffect(load, [candidateId])

  const addNote = async () => {
    const trimmed = draft.trim()
    if (!trimmed || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || 'Failed to save note')
      }
      const created: Note = await res.json()
      setNotes((cur) => (cur ? [created, ...cur] : [created]))
      setDraft('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note')
    } finally {
      setSaving(false)
    }
  }

  const deleteNote = async (id: string) => {
    if (!confirm('Delete this note?')) return
    const prev = notes
    setNotes((cur) => (cur ? cur.filter((n) => n.id !== id) : cur))
    const res = await fetch(`/api/candidates/${candidateId}/notes/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      setNotes(prev)
      const j = await res.json().catch(() => ({}))
      alert(j?.error || 'Failed to delete note')
    }
  }

  const startEdit = (n: Note) => {
    setEditingId(n.id)
    setEditDraft(n.body)
  }

  const saveEdit = async (id: string) => {
    const trimmed = editDraft.trim()
    if (!trimmed) return
    const res = await fetch(`/api/candidates/${candidateId}/notes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: trimmed }),
    })
    if (res.ok) {
      const updated: Note = await res.json()
      setNotes((cur) => cur ? cur.map((n) => (n.id === id ? updated : n)) : cur)
      setEditingId(null)
      setEditDraft('')
    } else {
      const j = await res.json().catch(() => ({}))
      alert(j?.error || 'Failed to update note')
    }
  }

  return (
    <div className="bg-white rounded-[12px] border border-surface-border p-6 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-grey-15">Notes</h3>
        <span className="text-xs text-grey-40">{notes?.length ?? 0}</span>
      </div>

      <div className="mb-4">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              addNote()
            }
          }}
          rows={3}
          placeholder="Add a private note about this candidate. Only your team sees it."
          className="w-full px-3 py-2 border border-surface-border rounded-[8px] text-sm text-grey-15 placeholder:text-grey-50 focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-none"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-grey-50">⌘+Enter to save</span>
          <button
            onClick={addNote}
            disabled={!draft.trim() || saving}
            className="text-xs px-3 py-1.5 rounded-[6px] bg-brand-500 text-white font-semibold hover:bg-brand-600 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add note'}
          </button>
        </div>
        {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
      </div>

      {notes === null ? (
        <div className="text-sm text-grey-40 py-6 text-center">Loading…</div>
      ) : notes.length === 0 ? (
        <div className="text-sm text-grey-40 py-6 text-center border border-dashed border-surface-border rounded-[8px]">
          No notes yet.
        </div>
      ) : (
        <ul className="space-y-2.5">
          {notes.map((n) => {
            const isEditing = editingId === n.id
            const edited = n.updatedAt !== n.createdAt
            return (
              <li key={n.id} className="group rounded-[8px] border border-surface-border p-3">
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <div className="text-xs text-grey-40">
                    <span className="font-medium text-grey-20">{n.authorName || 'Unknown'}</span>
                    <span className="mx-1.5 text-grey-50">·</span>
                    <span title={new Date(n.createdAt).toLocaleString()}>{formatRelative(n.createdAt)}</span>
                    {edited && <span className="ml-1 text-grey-50">(edited)</span>}
                  </div>
                  {!isEditing && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEdit(n)}
                        className="text-[11px] px-2 py-0.5 rounded-md text-grey-40 hover:bg-surface-light hover:text-grey-15"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteNote(n.id)}
                        className="text-[11px] px-2 py-0.5 rounded-md text-grey-40 hover:bg-red-50 hover:text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
                {isEditing ? (
                  <>
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-surface-border rounded-[8px] text-sm text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-none"
                      autoFocus
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <button
                        onClick={() => { setEditingId(null); setEditDraft('') }}
                        className="text-xs px-3 py-1 rounded-[6px] text-grey-40 hover:text-grey-15"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => saveEdit(n.id)}
                        disabled={!editDraft.trim()}
                        className="text-xs px-3 py-1 rounded-[6px] bg-brand-500 text-white font-semibold hover:bg-brand-600 disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-grey-15 whitespace-pre-wrap break-words">{n.body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
