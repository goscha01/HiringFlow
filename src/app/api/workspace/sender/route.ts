import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createVerifiedSender, getVerifiedSender, resendVerification, deleteVerifiedSender } from '@/lib/sendgrid-sender'

export async function GET() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const workspace = await prisma.workspace.findUnique({
    where: { id: ws.workspaceId },
    select: {
      senderEmail: true,
      senderName: true,
      senderVerifiedId: true,
      senderVerifiedAt: true,
      senderAddress: true,
    },
  })
  if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

  // Refresh verified status from SendGrid if we have an ID
  let live: { verified: boolean } | null = null
  if (workspace.senderVerifiedId) {
    try {
      const sender = await getVerifiedSender(workspace.senderVerifiedId)
      if (sender) {
        live = { verified: sender.verified }
        // Sync our cached verifiedAt
        if (sender.verified && !workspace.senderVerifiedAt) {
          await prisma.workspace.update({
            where: { id: ws.workspaceId },
            data: { senderVerifiedAt: new Date() },
          })
          workspace.senderVerifiedAt = new Date()
        } else if (!sender.verified && workspace.senderVerifiedAt) {
          await prisma.workspace.update({
            where: { id: ws.workspaceId },
            data: { senderVerifiedAt: null },
          })
          workspace.senderVerifiedAt = null
        }
      } else {
        // Sender was deleted on SendGrid side — clear our record
        await prisma.workspace.update({
          where: { id: ws.workspaceId },
          data: { senderVerifiedId: null, senderVerifiedAt: null },
        })
        workspace.senderVerifiedId = null
        workspace.senderVerifiedAt = null
      }
    } catch {
      // Silently ignore — UI will just show cached state
    }
  }

  return NextResponse.json({
    senderEmail: workspace.senderEmail,
    senderName: workspace.senderName,
    senderVerifiedId: workspace.senderVerifiedId,
    verified: !!workspace.senderVerifiedAt,
    pending: !!workspace.senderVerifiedId && !workspace.senderVerifiedAt,
    address: workspace.senderAddress,
    live,
  })
}

export async function POST(request: NextRequest) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const body = await request.json()
  const { senderEmail, senderName, address } = body
  if (!senderEmail || !senderName) {
    return NextResponse.json({ error: 'senderEmail and senderName required' }, { status: 400 })
  }
  if (!address || !address.line1 || !address.city || !address.state || !address.zip || !address.country) {
    return NextResponse.json({ error: 'Full address required (line1, city, state, zip, country)' }, { status: 400 })
  }

  const workspace = await prisma.workspace.findUnique({ where: { id: ws.workspaceId } })
  if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

  // Remove any prior verified sender for this workspace
  if (workspace.senderVerifiedId) {
    await deleteVerifiedSender(workspace.senderVerifiedId).catch(() => {})
  }

  try {
    const sender = await createVerifiedSender({
      workspaceName: workspace.name,
      email: senderEmail,
      name: senderName,
      address,
    })

    await prisma.workspace.update({
      where: { id: ws.workspaceId },
      data: {
        senderEmail,
        senderName,
        senderVerifiedId: String(sender.id),
        senderVerifiedAt: null,
        senderAddress: address,
      },
    })

    return NextResponse.json({ success: true, senderId: sender.id, verified: sender.verified })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to create verified sender' }, { status: 400 })
  }
}

export async function DELETE() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const workspace = await prisma.workspace.findUnique({
    where: { id: ws.workspaceId },
    select: { senderVerifiedId: true },
  })
  if (workspace?.senderVerifiedId) {
    await deleteVerifiedSender(workspace.senderVerifiedId).catch(() => {})
  }

  await prisma.workspace.update({
    where: { id: ws.workspaceId },
    data: { senderVerifiedId: null, senderVerifiedAt: null },
  })

  return NextResponse.json({ success: true })
}
