import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { authenticateDomain, getDomain, deleteDomain, extractCnames } from '@/lib/sendgrid-domain'

export async function GET() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const workspace = await prisma.workspace.findUnique({
    where: { id: ws.workspaceId },
    select: {
      senderEmail: true,
      senderName: true,
      senderDomain: true,
      senderDomainId: true,
      senderDomainValidatedAt: true,
    },
  })
  if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

  let cnames: Array<{ host: string; value: string; purpose: string; valid?: boolean }> = []
  let live: { valid: boolean } | null = null

  if (workspace.senderDomainId) {
    const d = await getDomain(workspace.senderDomainId).catch(() => null)
    if (d) {
      live = { valid: d.valid }
      cnames = extractCnames(d).map(c => {
        // Find matching valid flag
        const dns = d.dns as Record<string, { host?: string; valid?: boolean }>
        const match = Object.values(dns).find(r => r && r.host === c.host)
        return { ...c, valid: match?.valid }
      })
      // Sync cached validated timestamp
      if (d.valid && !workspace.senderDomainValidatedAt) {
        await prisma.workspace.update({ where: { id: ws.workspaceId }, data: { senderDomainValidatedAt: new Date() } })
        workspace.senderDomainValidatedAt = new Date()
      } else if (!d.valid && workspace.senderDomainValidatedAt) {
        await prisma.workspace.update({ where: { id: ws.workspaceId }, data: { senderDomainValidatedAt: null } })
        workspace.senderDomainValidatedAt = null
      }
    }
  }

  return NextResponse.json({
    senderEmail: workspace.senderEmail,
    senderName: workspace.senderName,
    senderDomain: workspace.senderDomain,
    senderDomainId: workspace.senderDomainId,
    validated: !!workspace.senderDomainValidatedAt,
    cnames,
    live,
  })
}

export async function POST(request: NextRequest) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const body = await request.json()
  const { domain, subdomain, senderEmail, senderName } = body
  if (!domain || typeof domain !== 'string') {
    return NextResponse.json({ error: 'domain required' }, { status: 400 })
  }
  // Strip protocol / path if user pasted a URL
  const cleaned = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase().trim()
  if (!cleaned.includes('.')) {
    return NextResponse.json({ error: 'Invalid domain' }, { status: 400 })
  }
  if (senderEmail && !senderEmail.toLowerCase().endsWith('@' + cleaned)) {
    return NextResponse.json({ error: `Sender email must end with @${cleaned}` }, { status: 400 })
  }

  const workspace = await prisma.workspace.findUnique({ where: { id: ws.workspaceId } })
  if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

  // Remove any prior domain record for this workspace
  if (workspace.senderDomainId) {
    await deleteDomain(workspace.senderDomainId).catch(() => {})
  }

  const cleanedSubdomain = typeof subdomain === 'string' ? subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') : ''

  try {
    const d = await authenticateDomain(cleaned, cleanedSubdomain || undefined)
    await prisma.workspace.update({
      where: { id: ws.workspaceId },
      data: {
        senderDomain: cleaned,
        senderDomainId: String(d.id),
        senderDomainValidatedAt: d.valid ? new Date() : null,
        ...(senderEmail !== undefined ? { senderEmail } : {}),
        ...(senderName !== undefined ? { senderName } : {}),
      },
    })
    return NextResponse.json({ success: true, domainId: d.id, cnames: extractCnames(d) })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to create domain authentication' }, { status: 400 })
  }
}

export async function DELETE() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const workspace = await prisma.workspace.findUnique({
    where: { id: ws.workspaceId },
    select: { senderDomainId: true },
  })
  if (workspace?.senderDomainId) {
    await deleteDomain(workspace.senderDomainId).catch(() => {})
  }
  await prisma.workspace.update({
    where: { id: ws.workspaceId },
    data: { senderDomain: null, senderDomainId: null, senderDomainValidatedAt: null },
  })
  return NextResponse.json({ success: true })
}

export async function PATCH(request: NextRequest) {
  // Update the from address/name after domain is validated
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const { senderEmail, senderName } = await request.json()
  const workspace = await prisma.workspace.findUnique({ where: { id: ws.workspaceId } })
  if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

  if (senderEmail && workspace.senderDomain && !senderEmail.toLowerCase().endsWith('@' + workspace.senderDomain)) {
    return NextResponse.json({ error: `Sender email must end with @${workspace.senderDomain}` }, { status: 400 })
  }

  await prisma.workspace.update({
    where: { id: ws.workspaceId },
    data: {
      ...(senderEmail !== undefined ? { senderEmail } : {}),
      ...(senderName !== undefined ? { senderName } : {}),
    },
  })
  return NextResponse.json({ success: true })
}
