'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface Answer {
  id: string
  answeredAt: string
  step: {
    id: string
    title: string
    questionText: string | null
  }
  option: {
    id: string
    optionText: string
  } | null
}

interface CandidateSubmission {
  id: string
  submittedAt: string
  step: {
    id: string
    title: string
    questionText: string | null
  }
  videoStorageKey: string | null
  videoFilename: string | null
  textMessage: string | null
}

interface Session {
  id: string
  candidateName: string | null
  candidateEmail: string | null
  candidatePhone: string | null
  outcome: string | null
  pipelineStatus: string | null
  formData: Record<string, string> | null
  source: string | null
  startedAt: string
  finishedAt: string | null
  answers: Answer[]
  submissions: CandidateSubmission[]
}

interface Flow {
  id: string
  name: string
}

export default function SubmissionsPage() {
  const params = useParams()
  const flowId = params.id as string

  const [flow, setFlow] = useState<Flow | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [flowId])

  const fetchData = async () => {
    const [flowRes, sessionsRes] = await Promise.all([
      fetch(`/api/flows/${flowId}`),
      fetch(`/api/flows/${flowId}/submissions`),
    ])

    if (flowRes.ok) {
      const flowData = await flowRes.json()
      setFlow(flowData)
    }

    if (sessionsRes.ok) {
      const sessionsData = await sessionsRes.json()
      setSessions(sessionsData)
    }

    setLoading(false)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center space-x-4 mb-6">
        <Link
          href="/admin/flows"
          className="text-gray-500 hover:text-gray-700"
        >
          &larr; Back
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          Submissions: {flow?.name}
        </h1>
      </div>

      <div className="flex gap-6">
        {/* Sessions List */}
        <div className="w-96 bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-gray-900">
              Sessions ({sessions.length})
            </h2>
          </div>
          <div className="divide-y max-h-[calc(100vh-16rem)] overflow-y-auto">
            {sessions.length === 0 ? (
              <div className="p-4 text-gray-500 text-center">
                No submissions yet
              </div>
            ) : (
              sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setSelectedSession(session)}
                  className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                    selectedSession?.id === session.id ? 'bg-brand-50' : ''
                  }`}
                >
                  <div className="font-medium text-gray-900">
                    {session.candidateName || 'Anonymous'}
                  </div>
                  {session.candidateEmail && (
                    <div className="text-sm text-gray-500">
                      {session.candidateEmail}
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">
                    {formatDate(session.startedAt)}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full ${
                        session.outcome === 'passed' ? 'bg-green-100 text-green-700' :
                        session.outcome === 'failed' ? 'bg-red-100 text-red-700' :
                        session.finishedAt ? 'bg-brand-100 text-brand-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {session.outcome === 'passed' ? 'Passed' :
                       session.outcome === 'failed' ? 'Failed' :
                       session.finishedAt ? 'Completed' : 'In Progress'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {session.answers.length} answer
                      {session.answers.length !== 1 && 's'}
                    </span>
                    {session.submissions.length > 0 && (
                      <span className="text-xs text-purple-600">
                        {session.submissions.length} submission
                        {session.submissions.length !== 1 && 's'}
                      </span>
                    )}
                  </div>
                  {session.pipelineStatus && (
                    <div className="mt-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        session.pipelineStatus === 'scheduled' ? 'bg-green-100 text-green-700' :
                        session.pipelineStatus === 'invited_to_schedule' ? 'bg-purple-100 text-purple-700' :
                        session.pipelineStatus === 'training_completed' ? 'bg-blue-100 text-blue-700' :
                        session.pipelineStatus === 'training_in_progress' ? 'bg-cyan-100 text-cyan-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {session.pipelineStatus.replace(/_/g, ' ')}
                      </span>
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Session Detail */}
        <div className="flex-1 bg-white rounded-lg shadow p-6">
          {selectedSession ? (
            <div>
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900">
                  {selectedSession.candidateName || 'Anonymous'}
                </h2>
                {selectedSession.candidateEmail && (
                  <p className="text-gray-500">{selectedSession.candidateEmail}</p>
                )}
                <p className="text-sm text-gray-400 mt-1">
                  Started: {formatDate(selectedSession.startedAt)}
                  {selectedSession.finishedAt && (
                    <> &middot; Finished: {formatDate(selectedSession.finishedAt)}</>
                  )}
                </p>
                {/* Pipeline Status */}
                <div className="flex items-center gap-2 mt-3">
                  {selectedSession.pipelineStatus && (
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      selectedSession.pipelineStatus === 'scheduled' ? 'bg-green-100 text-green-700' :
                      selectedSession.pipelineStatus === 'invited_to_schedule' ? 'bg-purple-100 text-purple-700' :
                      selectedSession.pipelineStatus === 'training_completed' ? 'bg-blue-100 text-blue-700' :
                      selectedSession.pipelineStatus === 'training_in_progress' ? 'bg-cyan-100 text-cyan-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      Pipeline: {selectedSession.pipelineStatus.replace(/_/g, ' ')}
                    </span>
                  )}
                  {selectedSession.pipelineStatus && selectedSession.pipelineStatus !== 'scheduled' && (
                    <button
                      onClick={async () => {
                        const res = await fetch(`/api/sessions/${selectedSession.id}/pipeline`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ pipelineStatus: 'scheduled' }),
                        })
                        if (res.ok) {
                          setSelectedSession({ ...selectedSession, pipelineStatus: 'scheduled' })
                          setSessions(sessions.map(s => s.id === selectedSession.id ? { ...s, pipelineStatus: 'scheduled' } : s))
                        }
                      }}
                      className="text-xs px-2.5 py-1 rounded-full border border-green-300 text-green-700 hover:bg-green-50"
                    >
                      Mark as Scheduled
                    </button>
                  )}
                </div>
              </div>

              <h3 className="font-semibold text-gray-900 mb-4">Answers</h3>
              {selectedSession.answers.length === 0 ? (
                <p className="text-gray-500">No answers recorded yet</p>
              ) : (
                <div className="space-y-4">
                  {selectedSession.answers.map((answer, index) => (
                    <div
                      key={answer.id}
                      className="border-l-4 border-brand-500 pl-4 py-2"
                    >
                      <div className="text-sm text-gray-500 mb-1">
                        Step {index + 1}: {answer.step.title}
                      </div>
                      {answer.step.questionText && (
                        <div className="font-medium text-gray-900 mb-1">
                          {answer.step.questionText}
                        </div>
                      )}
                      {answer.option && (
                        <div className="inline-block bg-brand-100 text-brand-800 px-3 py-1 rounded-full text-sm">
                          {answer.option.optionText}
                        </div>
                      )}
                      <div className="text-xs text-gray-400 mt-2">
                        {formatDate(answer.answeredAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Candidate Submissions */}
              {selectedSession.submissions.length > 0 && (
                <>
                  <h3 className="font-semibold text-gray-900 mb-4 mt-8">
                    Candidate Submissions
                  </h3>
                  <div className="space-y-6">
                    {selectedSession.submissions.map((submission) => (
                      <div
                        key={submission.id}
                        className="border-l-4 border-purple-500 pl-4 py-2"
                      >
                        <div className="text-sm text-gray-500 mb-1">
                          {submission.step.title}
                        </div>
                        {submission.step.questionText && (
                          <div className="font-medium text-gray-900 mb-3">
                            {submission.step.questionText}
                          </div>
                        )}

                        {submission.videoStorageKey && (
                          <div className="mb-3">
                            <div className="text-sm text-gray-600 mb-2">
                              Video Response:
                            </div>
                            <video
                              src={`/uploads/${submission.videoStorageKey}`}
                              controls
                              className="w-full max-w-md rounded-lg bg-black"
                            />
                            <div className="text-xs text-gray-400 mt-1">
                              {submission.videoFilename}
                            </div>
                          </div>
                        )}

                        {submission.textMessage && (
                          <div className="mb-3">
                            <div className="text-sm text-gray-600 mb-2">
                              Text Response:
                            </div>
                            <div className="bg-gray-50 p-3 rounded-lg text-gray-800 whitespace-pre-wrap">
                              {submission.textMessage}
                            </div>
                          </div>
                        )}

                        <div className="text-xs text-gray-400 mt-2">
                          Submitted: {formatDate(submission.submittedAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              Select a session to view details
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
