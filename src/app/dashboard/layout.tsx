/**
 * Dashboard chrome — refreshed per design handoff. Drops the orange top
 * banner and uses the 60px TopNav primitive from src/components/design.
 *
 * The PageHeader blocks on each page were written with a negative horizontal
 * margin (-mx-6 lg:-mx-[132px]) so they span full-bleed against the content
 * container's outer edge. That still works here — the main element keeps
 * its max-w-[1596px] centered container.
 */

'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'
import { TopNav, type TopNavItem } from '@/components/design'

const NAV_ITEMS: TopNavItem[] = [
  { href: '/dashboard/candidates', label: 'Candidates' },
  { href: '/dashboard/campaigns', label: 'Campaigns' },
  { href: '/dashboard/flows', label: 'Screening' },
  { href: '/dashboard/automations', label: 'Automations' },
  { href: '/dashboard/scheduling', label: 'Scheduling' },
  { href: '/dashboard/trainings', label: 'Trainings', matches: ['/dashboard/trainings', '/dashboard/ai-calls'] },
  { href: '/dashboard/content', label: 'Assets', matches: ['/dashboard/content', '/dashboard/videos'] },
  { href: '/dashboard/branding', label: 'Branding' },
  { href: '/dashboard/analytics', label: 'Analytics' },
  { href: '/dashboard/settings', label: 'Settings' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || ''
  const { data: session } = useSession()
  const user = session?.user as { name?: string; email?: string; workspaceName?: string; isSuperAdmin?: boolean } | undefined
  const workspaceName = user?.workspaceName || ''
  const isSuperAdmin = user?.isSuperAdmin || false

  // The "is this tab active" logic (matching subpaths like /flows/[id]/builder)
  // lives inside TopNav via its own pathname check.

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <TopNav
        items={NAV_ITEMS}
        workspaceName={workspaceName}
        user={{ name: user?.name, avatarUrl: null }}
        // The design's CTA slot on the right (e.g. "+ New flow"). We use it
        // for the super-admin link + sign-out action here so all workspace
        // chrome affordances stay on one bar.
        cta={
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <Link
                href="/platform-admin"
                className="font-mono text-[10px] uppercase px-2.5 py-1 rounded-full border"
                style={{ letterSpacing: '0.1em', color: 'var(--warn-fg)', background: 'var(--warn-bg)', borderColor: 'transparent' }}
              >
                Platform
              </Link>
            )}
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-[12px] text-grey-35 hover:text-ink transition-colors px-2 py-1"
              title="Sign out"
            >
              Sign out
            </button>
          </div>
        }
      />

      <main className={`flex-1 w-full max-w-[1596px] mx-auto px-6 lg:px-[132px] py-8 ${pathname.endsWith('/builder') ? 'pt-0' : ''}`}>
        {children}
      </main>
    </div>
  )
}
