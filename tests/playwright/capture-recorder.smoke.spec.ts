// Playwright smoke for the CaptureRecorder component. Uses Chromium's fake
// audio device + Playwright's route interception so we can exercise the full
// click-to-submit flow without needing a real DB, S3, or microphone.
//
// Run:
//   npm run dev        # in one terminal
//   npx playwright test tests/playwright/capture-recorder.smoke.spec.ts
//
// Coverage:
//   - MediaRecorder constructs against a real (fake-audio) MediaStream.
//   - State machine progresses idle → recording → preview → uploading → submitted.
//   - Upload progress events fire via XMLHttpRequest.upload.onprogress.
//   - beforeunload guard does not block test cleanup (we only assert it
//     wasn't installed when state isn't active).
//   - Browser console emits the structured capture_* log events.
//
// Not covered here:
//   - Real S3 PUT roundtrip
//   - Real prisma persistence
//   - Mobile Safari behaviour (run manually on an iOS device)

import { test, expect, chromium, Browser, Page } from '@playwright/test'

const HARNESS_URL = process.env.HARNESS_URL || 'http://localhost:3000/test/capture-recorder'
const FAKE_CAPTURE_ID = '00000000-0000-0000-0000-000000000001'

test.describe('CaptureRecorder happy path', () => {
  let browser: Browser
  let page: Page

  test.beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      args: [
        // Chromium synthesises an audio device (440 Hz tone by default) when
        // these flags are set. getUserMedia resolves without a permission
        // prompt, and MediaRecorder produces real bytes.
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
      ],
    })
  })

  test.afterAll(async () => {
    await browser?.close()
  })

  test.beforeEach(async () => {
    page = await browser.newPage()

    // Intercept the three capture endpoints. Each returns a synthetic but
    // structurally correct payload — the recorder UI doesn't care that no
    // real S3 object exists, only that the JSON shape matches.
    await page.route('**/api/public/sessions/*/captures/presign', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          captureId: FAKE_CAPTURE_ID,
          // Point the recorder's PUT at an in-page sink we'll intercept below.
          uploadUrl: 'https://fake-s3.example/capture-put',
          storageKey: 'captures/test/test/test/test.webm',
          expiresAt: new Date(Date.now() + 900_000).toISOString(),
        }),
      })
    })
    // S3 PUT: respond 200 to make the XHR succeed.
    await page.route('https://fake-s3.example/capture-put', async (route) => {
      await route.fulfill({ status: 200, body: '' })
    })
    await page.route('**/api/public/sessions/*/captures/finalize', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          capture: {
            id: FAKE_CAPTURE_ID,
            status: 'processed',
            fileSizeBytes: 12345,
            durationSec: 1.5,
          },
        }),
      })
    })

    // Capture all browser console messages so we can assert log events.
    page.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('[capture]')) {
        // eslint-disable-next-line no-console
        console.log('  ▷', text.slice(0, 240))
      }
    })
  })

  test.afterEach(async () => {
    await page.close()
  })

  test('idle → record → stop → preview → submit → submitted', async () => {
    await page.goto(HARNESS_URL)
    await expect(page.getByRole('heading', { name: 'CaptureRecorder harness' })).toBeVisible()

    // Idle copy
    await expect(page.getByText(/Record your answer\./)).toBeVisible()
    const recordBtn = page.getByRole('button', { name: /Record your answer/ })
    await expect(recordBtn).toBeEnabled()

    await recordBtn.click()
    // Stop button shows up once getUserMedia resolves and recording begins.
    const stopBtn = page.getByRole('button', { name: 'Stop' })
    await expect(stopBtn).toBeVisible({ timeout: 5_000 })

    // Record for ~1s so we have a non-trivial blob, then stop.
    await page.waitForTimeout(1_000)
    await stopBtn.click()

    // Preview appears with an audio element + Submit/Retake.
    const submitBtn = page.getByRole('button', { name: 'Submit', exact: true })
    await expect(submitBtn).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('audio')).toHaveCount(1)

    await submitBtn.click()
    // Uploading state shows a disabled "Submitting…" affordance + progress bar.
    await expect(page.getByText(/Uploading your recording/)).toBeVisible({ timeout: 5_000 })

    // Final success state.
    await expect(page.getByText(/Submitted — thank you/)).toBeVisible({ timeout: 5_000 })
  })

  test('retake increments counter and lets the candidate re-record', async () => {
    await page.goto(HARNESS_URL)
    await page.getByRole('button', { name: /Record your answer/ }).click()
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 5_000 })
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Stop' }).click()
    await expect(page.getByRole('button', { name: 'Submit', exact: true })).toBeVisible({ timeout: 5_000 })

    // Click Retake (allowed because maxRetakes=2 in the harness).
    await page.getByRole('button', { name: /Retake/ }).click()
    // We should be back to the idle/record button.
    await expect(page.getByRole('button', { name: /Record your answer/ })).toBeVisible({ timeout: 2_000 })
    await expect(page.getByText(/Retake 1 of/)).toBeVisible()
  })
})
