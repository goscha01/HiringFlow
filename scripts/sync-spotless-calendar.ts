/**
 * Manually sync the Spotless Homes Google Calendar — bypasses the UI.
 * Tests whether the stored refresh_token is still valid, and if so,
 * processes any events since the last syncToken (which should include
 * Tetiana's Calendly booking).
 */
import { google } from 'googleapis'
import { PrismaClient } from '@prisma/client'

const SPOTLESS_WS = '739bcd71-69fd-4b30-a39e-242521b7ab20'

const p = new PrismaClient()

async function main() {
  const integ = await p.googleIntegration.findUnique({ where: { workspaceId: SPOTLESS_WS } })
  if (!integ) { console.log('NO INTEGRATION'); return }

  console.log(`Integration: ${integ.googleEmail}, calendar=${integ.calendarId}`)
  console.log(`accessExpiresAt: ${integ.accessExpiresAt?.toISOString() ?? 'null'}`)
  console.log(`syncToken: ${integ.syncToken ?? 'null'}`)
  console.log(`lastSyncedAt: ${integ.lastSyncedAt?.toISOString() ?? 'null'}`)

  const { decrypt } = await import('../src/lib/crypto')
  const refreshToken = decrypt(integ.refreshToken)
  const accessToken = integ.accessToken ? decrypt(integ.accessToken) : undefined

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/integrations/google/callback'
  )
  client.setCredentials({
    refresh_token: refreshToken,
    access_token: accessToken,
    expiry_date: integ.accessExpiresAt?.getTime(),
  })

  // Step 1: try to refresh the access token explicitly
  console.log('\n=== Step 1: refreshing access token ===')
  try {
    const res = await client.refreshAccessToken()
    console.log('Refresh OK. New expiry:', res.credentials.expiry_date ? new Date(res.credentials.expiry_date).toISOString() : 'null')
    console.log('New scopes:', res.credentials.scope)
  } catch (e: any) {
    console.error('REFRESH FAILED:', e?.response?.data || e?.message || e)
    console.log('\n>>> The refresh token is dead. User must reconnect via the UI.')
    console.log('    The "Reconnect Google" button (NOT "Re-check now") needs to complete.')
    return
  }

  // Step 2: list calendar events since syncToken — should include Tetiana
  console.log('\n=== Step 2: listing calendar events ===')
  const cal = google.calendar({ version: 'v3', auth: client })
  try {
    const { data } = await cal.events.list({
      calendarId: integ.calendarId,
      syncToken: integ.syncToken ?? undefined,
      singleEvents: true,
      maxResults: 50,
    })
    console.log(`Got ${data.items?.length ?? 0} events. nextSyncToken=${data.nextSyncToken ? 'yes' : 'no'}`)
    for (const ev of data.items ?? []) {
      const att = (ev.attendees ?? []).map(a => a.email).join(', ')
      console.log(`  ${ev.start?.dateTime ?? ev.start?.date}  id=${ev.id}  status=${ev.status}  summary="${ev.summary ?? ''}"`)
      console.log(`    attendees=${att}`)
      if (ev.hangoutLink) console.log(`    hangoutLink=${ev.hangoutLink}`)
    }

    // Also do a forward-window list to catch the booking even if syncToken is stale
    console.log('\n=== Forward window: events starting in next 30 days ===')
    const future = await cal.events.list({
      calendarId: integ.calendarId,
      timeMin: new Date().toISOString(),
      timeMax: new Date(Date.now() + 30*24*3600*1000).toISOString(),
      singleEvents: true,
      maxResults: 50,
      orderBy: 'startTime',
    })
    console.log(`Got ${future.data.items?.length ?? 0} future events`)
    for (const ev of future.data.items ?? []) {
      const att = (ev.attendees ?? []).map(a => a.email).join(', ')
      const tetianaMatch = att.toLowerCase().includes('tetiana') ? '  <<< TETIANA' : ''
      console.log(`  ${ev.start?.dateTime ?? ev.start?.date}  id=${ev.id}  "${ev.summary ?? ''}"${tetianaMatch}`)
      if (tetianaMatch) {
        console.log(`    attendees=${att}`)
        console.log(`    hangoutLink=${ev.hangoutLink}`)
        console.log(`    description=${(ev.description ?? '').slice(0,200)}`)
      }
    }
  } catch (e: any) {
    console.error('LIST FAILED:', e?.response?.data || e?.message || e)
    if (e?.response?.data?.error === 'invalid_grant' || e?.code === 401) {
      console.log('\n>>> Auth failed mid-list. Refresh token is dead.')
    }
  }
}

main().catch(console.error).finally(() => p.$disconnect())
