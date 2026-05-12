'use client'

// Dev-only test harness for the CaptureRecorder component. Exists so
// Playwright (and the team's manual QA) can drive the recorder in isolation
// without needing a published flow + seeded Session in the DB.
//
// Returns null in production builds — gated by NODE_ENV so accidental
// exposure on hirefunnel.app isn't possible. (Client component so the
// onSubmitted callback can be passed without server-component restrictions.)

import CaptureRecorder from '@/components/CaptureRecorder'

export default function CaptureRecorderTestHarness() {
  if (process.env.NODE_ENV === 'production') {
    return null
  }
  return (
    <div className="min-h-screen bg-[#F7F7F8] p-6">
      <div className="mx-auto max-w-xl space-y-4">
        <header className="space-y-1">
          <h1 className="text-lg font-semibold text-[#262626]">CaptureRecorder harness</h1>
          <p className="text-xs text-[#656567]">
            Dev-only page. Drives the audio recorder against fake session/step ids.
            Backend calls (presign / finalize) are stubbed in tests via Playwright's
            <code className="mx-1 rounded bg-[#F1F1F3] px-1 py-0.5 font-mono text-[11px]">page.route()</code>.
          </p>
        </header>
        <CaptureRecorder
          sessionId="test-session-id"
          stepId="test-step-id"
          mode="audio"
          prompt="Tell us about yourself in 10 seconds."
          allowRetake={true}
          maxRetakes={2}
          maxDurationSec={20}
          minDurationSec={null}
          onSubmitted={(c) => {
            // eslint-disable-next-line no-console
            console.log('[harness] capture submitted', c)
          }}
        />
      </div>
    </div>
  )
}
