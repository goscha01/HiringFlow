import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { exchangeCode, startWatch } from '@/lib/google'
import { encrypt } from '@/lib/crypto'

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
    const { refreshToken, accessToken, expiresAt, email, hostedDomain, grantedScopes } = await exchangeCode(code)

    await prisma.googleIntegration.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        googleEmail: email,
        refreshToken: encrypt(refreshToken),
        accessToken: accessToken ? encrypt(accessToken) : null,
        accessExpiresAt: expiresAt,
        calendarId: 'primary',
        grantedScopes,
        hostedDomain,
      },
      update: {
        googleEmail: email,
        refreshToken: encrypt(refreshToken),
        accessToken: accessToken ? encrypt(accessToken) : null,
        accessExpiresAt: expiresAt,
        grantedScopes,
        hostedDomain,
        // Reconnect invalidates prior capability probe — it'll be re-run
        // lazily on the next scheduling attempt or by the cron.
        recordingCapable: null,
        recordingCapabilityCheckedAt: null,
        recordingCapabilityReason: null,
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

    return NextResponse.redirect(new URL(`${redirectBase}&status=connected`, url.origin))
  } catch (err: any) {
    console.error('[Google] Callback error:', err)
    return NextResponse.redirect(new URL(`${redirectBase}&status=error&msg=${encodeURIComponent(err?.message || 'unknown')}`, url.origin))
  }
}
