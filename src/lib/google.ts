import { google } from 'googleapis'
import { randomBytes } from 'crypto'
import { prisma } from './prisma'
import { encrypt, decrypt } from './crypto'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
]

function getAppUrl(): string {
  return process.env.APP_URL
    || process.env.NEXT_PUBLIC_APP_URL
    || process.env.NEXTAUTH_URL
    || 'https://www.hirefunnel.app'
}

function getRedirectUri(): string {
  return process.env.GOOGLE_REDIRECT_URI || `${getAppUrl()}/api/integrations/google/callback`
}

export function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured')
  }
  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri())
}

export function buildConsentUrl(stateToken: string): string {
  return getOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: stateToken,
    include_granted_scopes: true,
  })
}

export async function exchangeCode(code: string) {
  const client = getOAuthClient()
  const { tokens } = await client.getToken(code)
  if (!tokens.refresh_token) {
    throw new Error('No refresh token returned — user may need to revoke access and re-consent')
  }
  client.setCredentials(tokens)
  const { data: userInfo } = await google.oauth2({ version: 'v2', auth: client }).userinfo.get()
  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token || null,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    email: userInfo.email || '',
  }
}

export async function getAuthedClientForWorkspace(workspaceId: string) {
  const integration = await prisma.googleIntegration.findUnique({ where: { workspaceId } })
  if (!integration) return null
  const client = getOAuthClient()
  client.setCredentials({
    refresh_token: decrypt(integration.refreshToken),
    access_token: integration.accessToken ? decrypt(integration.accessToken) : undefined,
    expiry_date: integration.accessExpiresAt?.getTime(),
  })
  // googleapis handles refresh automatically when access token expired
  client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await prisma.googleIntegration.update({
        where: { workspaceId },
        data: {
          accessToken: encrypt(tokens.access_token),
          accessExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        },
      }).catch(() => {})
    }
  })
  return { client, integration }
}

export async function startWatch(workspaceId: string) {
  const authed = await getAuthedClientForWorkspace(workspaceId)
  if (!authed) throw new Error('No integration for workspace')
  const { client, integration } = authed

  const calendar = google.calendar({ version: 'v3', auth: client })
  const channelId = randomBytes(16).toString('hex')
  const watchToken = randomBytes(24).toString('hex')
  const webhookUrl = `${getAppUrl()}/api/webhooks/google`

  const res = await calendar.events.watch({
    calendarId: integration.calendarId,
    requestBody: {
      id: channelId,
      type: 'web_hook',
      address: webhookUrl,
      token: watchToken,
    },
  })

  // Also grab an initial syncToken so we can do incremental syncs later
  const sync = await calendar.events.list({
    calendarId: integration.calendarId,
    maxResults: 1,
    showDeleted: true,
    singleEvents: true,
  })

  await prisma.googleIntegration.update({
    where: { workspaceId },
    data: {
      watchChannelId: channelId,
      watchResourceId: res.data.resourceId || null,
      watchToken,
      watchExpiresAt: res.data.expiration ? new Date(Number(res.data.expiration)) : null,
      syncToken: sync.data.nextSyncToken || null,
    },
  })
}

export async function stopWatch(workspaceId: string) {
  const authed = await getAuthedClientForWorkspace(workspaceId)
  if (!authed) return
  const { client, integration } = authed
  if (!integration.watchChannelId || !integration.watchResourceId) return

  const calendar = google.calendar({ version: 'v3', auth: client })
  await calendar.channels.stop({
    requestBody: {
      id: integration.watchChannelId,
      resourceId: integration.watchResourceId,
    },
  }).catch((err) => {
    console.error('[Google] stopWatch failed (channel may already be expired):', err?.message)
  })

  await prisma.googleIntegration.update({
    where: { workspaceId },
    data: {
      watchChannelId: null,
      watchResourceId: null,
      watchToken: null,
      watchExpiresAt: null,
    },
  })
}

export async function pullChangedEvents(workspaceId: string) {
  const authed = await getAuthedClientForWorkspace(workspaceId)
  if (!authed) return { events: [], newSyncToken: null }
  const { client, integration } = authed

  const calendar = google.calendar({ version: 'v3', auth: client })

  try {
    const res = await calendar.events.list({
      calendarId: integration.calendarId,
      syncToken: integration.syncToken || undefined,
      showDeleted: true,
      singleEvents: true,
      maxResults: 100,
    })

    if (res.data.nextSyncToken) {
      await prisma.googleIntegration.update({
        where: { workspaceId },
        data: { syncToken: res.data.nextSyncToken, lastSyncedAt: new Date() },
      })
    }

    return { events: res.data.items || [], newSyncToken: res.data.nextSyncToken || null }
  } catch (err: any) {
    // 410 GONE — syncToken invalid, need to do a full re-sync
    if (err?.code === 410) {
      const full = await calendar.events.list({
        calendarId: integration.calendarId,
        timeMin: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        showDeleted: true,
        singleEvents: true,
        maxResults: 100,
      })
      await prisma.googleIntegration.update({
        where: { workspaceId },
        data: { syncToken: full.data.nextSyncToken || null, lastSyncedAt: new Date() },
      })
      return { events: full.data.items || [], newSyncToken: full.data.nextSyncToken || null }
    }
    throw err
  }
}

export { encrypt, decrypt }
