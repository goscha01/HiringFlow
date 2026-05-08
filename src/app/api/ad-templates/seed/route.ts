import { NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const STARTER_TEMPLATES: Array<{
  name: string
  source: string
  headline: string
  bodyText: string
  requirements: string | null
  benefits: string | null
  callToAction: string | null
}> = [
  {
    name: 'Indeed — General hiring',
    source: 'indeed',
    headline: 'Now Hiring — Join Our Team!',
    bodyText: 'We are looking for motivated team members to join our growing company.\n\nThis is a great opportunity for someone who wants to grow their career.',
    requirements: '- Must be authorized to work\n- Reliable transportation\n- Positive attitude',
    benefits: '- Competitive pay\n- Flexible schedule\n- Growth opportunities',
    callToAction: 'Apply now — takes less than 5 minutes!',
  },
  {
    name: 'Facebook — Casual + friendly',
    source: 'facebook',
    headline: "We're Hiring! Come Work With Us",
    bodyText: "Looking for your next gig? We're hiring and we'd love to hear from you.\n\nNo long applications. Just a quick intro and you could start next week.",
    requirements: null,
    benefits: '- Weekly pay\n- Friendly team\n- No experience needed',
    callToAction: 'Tap the link to apply — it only takes a few minutes!',
  },
  {
    name: 'Craigslist — Direct',
    source: 'craigslist',
    headline: 'HIRING NOW — Apply Today',
    bodyText: 'Immediate openings available.\n\nWe are looking for reliable, hardworking individuals. Full-time and part-time positions.',
    requirements: '- Must be 18+\n- Background check required\n- Valid ID',
    benefits: '- Start ASAP\n- Paid training\n- Weekly pay',
    callToAction: 'Click the link below to apply online.',
  },
  {
    name: 'Google — Search ad style',
    source: 'google',
    headline: 'Hiring Reliable People — Apply in 5 Minutes',
    bodyText: 'Open positions — competitive pay, weekly schedule.\n\nApply through our quick online form, no resume required.',
    requirements: '- Reliable\n- Punctual\n- Good attitude',
    benefits: '- Steady hours\n- Paid training\n- Growth path',
    callToAction: 'Apply online now',
  },
  {
    name: 'LinkedIn — Professional',
    source: 'linkedin',
    headline: 'Now Hiring — Career Opportunity',
    bodyText: 'We are expanding our team and looking for motivated professionals to join us.\n\nA short video application replaces the traditional resume + cover letter — tell us about yourself in your own words.',
    requirements: '- Authorized to work\n- Strong communication skills\n- Customer-first mindset',
    benefits: '- Competitive compensation\n- Career development\n- Supportive team culture',
    callToAction: 'Submit your video application — under 5 minutes.',
  },
  {
    name: 'Instagram — Short + visual',
    source: 'instagram',
    headline: "We're Hiring 👀",
    bodyText: 'Quick apply, no resume needed.\n\nTell us about yourself in a short video — that\'s it.',
    requirements: null,
    benefits: '- Fast hiring\n- Flexible hours\n- Friendly crew',
    callToAction: 'Tap the link in bio to apply',
  },
  {
    name: 'TikTok — Conversational',
    source: 'tiktok',
    headline: 'POV: You found your next job 🎯',
    bodyText: "We're hiring and the application is just a quick video — no awkward interviews, no boring forms.",
    requirements: null,
    benefits: '- Weekly pay\n- Flexible schedule\n- Chill team',
    callToAction: 'Apply via the link — takes 2 minutes',
  },
  {
    name: 'Telegram — Group post',
    source: 'telegram',
    headline: 'Hiring now — quick video application',
    bodyText: "We're looking for new team members. Apply by recording a short video — no resume needed.",
    requirements: '- Reliable\n- Available to start soon',
    benefits: '- Steady pay\n- Friendly team',
    callToAction: 'Apply: ',
  },
  {
    name: 'Referral — Employee referral',
    source: 'referral',
    headline: 'Join our team — referred by a teammate',
    bodyText: 'Thanks for checking us out! Someone on our team thought you\'d be a great fit.\n\nApply with a quick video below — it\'s the fastest way to introduce yourself.',
    requirements: null,
    benefits: '- Referral bonus eligible\n- Friendly onboarding\n- Same team your referrer is on',
    callToAction: 'Record your intro and apply',
  },
  {
    name: 'General — All-purpose',
    source: 'general',
    headline: 'We Are Hiring!',
    bodyText: 'Join our team! We have openings available and are looking for great people.',
    requirements: null,
    benefits: '- Competitive pay\n- Great team',
    callToAction: 'Apply now through our quick online process!',
  },
]

export async function POST() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const existing = await prisma.adTemplate.findMany({
    where: { workspaceId: ws.workspaceId },
    select: { name: true },
  })
  const existingNames = new Set(existing.map(e => e.name))

  const toCreate = STARTER_TEMPLATES.filter(t => !existingNames.has(t.name))
  if (toCreate.length === 0) {
    return NextResponse.json({ created: 0, skipped: STARTER_TEMPLATES.length })
  }

  await prisma.adTemplate.createMany({
    data: toCreate.map(t => ({
      workspaceId: ws.workspaceId,
      createdById: ws.userId,
      name: t.name,
      source: t.source,
      headline: t.headline,
      bodyText: t.bodyText,
      requirements: t.requirements,
      benefits: t.benefits,
      callToAction: t.callToAction,
    })),
  })

  return NextResponse.json({ created: toCreate.length, skipped: existingNames.size })
}
