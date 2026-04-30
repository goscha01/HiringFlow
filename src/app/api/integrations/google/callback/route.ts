import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { exchangeCode, startWatch, hasMeetScopes } from '@/lib/google'
import { encrypt } from '@/lib/crypto'
import { probeRecordingCapability } from '@/lib/meet/recording-capability'
import { globalKillswitchActive } from '@/lib/meet/feature-flag'

export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const redirectBase = '/dashboard/settings?integration=google'

  if (error) {
    return NextResponse.redirect(new URL(`${redirectBase}&status=cancelled`, url.origin))
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL(`${redirectBase}&status=invalid`, url.origin))
  }

  const cookieStore = cookies()
  const workspaceId = cookieStore.get(`goog_oauth_${state}`)?.value
  if (!workspaceId) {
    return NextResponse.redirect(new URL(`${redirectBase}&status=expired`, url.origin))
  }
  cookieStore.delete(`goog_oauth_${state}`)

  try {
    const { refreshToken, accessToken, expiresAt, email, userId, displayName, hostedDomain, grantedScopes } = await exchangeCode(code)

    await prisma.googleIntegration.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        googleEmail: email,
        googleUserId: userId,
        googleDisplayName: displayName,
        refreshToken: encrypt(refreshToken),
        accessToken: accessToken ? encrypt(accessToken) : null,
        accessExpiresAt: expiresAt,
        calendarId: 'primary',
        grantedScopes,
        hostedDomain,
      },
      update: {
        googleEmail: email,
        googleUserId: userId,
        googleDisplayName: displayName,
        refreshToken: encrypt(refreshToken),
        accessToken: accessToken ? encrypt(accessToken) : null,
        accessExpiresAt: expiresAt,
        grantedScopes,
        hostedDomain,
        // Reconnect invalidates prior capability probe; we re-run it below
        // when Meet scopes are granted and the feature is enabled.
        recordingCapable: null,
        recordingCapabilityCheckedAt: null,
        recordingCapabilityReason: null,
        // Reset the Meet Recordings folder cache so a fresh lookup runs after
        // reconnect (in case the user has cleaned out the folder etc.)
        meetRecordingsFolderId: null,
      },
    })

    // Await startWatch — fire-and-forget breaks in Vercel serverless (function
    // returns → outstanding promises killed before Google API calls complete).
    try {
      await startWatch(workspaceId)
    } catch (err: any) {
      console.error('[Google] startWatch failed after connect:', err?.message)
      return NextResponse.redirect(new URL(`${redirectBase}&status=error&msg=${encodeURIComponent('Connected, but could not set up calendar watch: ' + (err?.message || 'unknown'))}`, url.origin))
    }

    if (hasMeetScopes(grantedScopes) && !globalKillswitchActive()) {
      const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { meetIntegrationV2Enabled: true },
      })
      if (ws?.meetIntegrationV2Enabled) {
        try {
          await probeRecordingCapability(workspaceId)
        } catch (err: any) {
          // Probe writes its own cached result on failure paths, and the
          // capability check is non-essential to the connect flow. Log and
          // continue — the badge will show "not yet checked" until the cron
          // or next scheduling attempt re-probes.
          console.error('[Google] recording probe failed after connect:', err?.message)
        }
      }
    }

    return NextResponse.redirect(new URL(`${redirectBase}&status=connected`, url.origin))
  } catch (err: any) {
    console.error('[Google] Callback error:', err)
    return NextResponse.redirect(new URL(`${redirectBase}&status=error&msg=${encodeURIComponent(err?.message || 'unknown')}`, url.origin))
  }
}
