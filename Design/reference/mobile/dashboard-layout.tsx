/**
 * Patched dashboard layout — paste into src/app/dashboard/layout.tsx.
 *
 * Changes vs the current layout:
 * - Wraps <main> in <SwipeTabs> so horizontal swipe on mobile routes to the
 *   adjacent tab with spring physics.
 * - Passes `mobilePattern` to TopNav so the drawer/bottom/pills choice is
 *   explicit and easy to change in one spot.
 * - Moves "Sign out" into the mobile drawer footer so it's reachable.
 * - Reserves bottom padding when the 'bottom' pattern is in use so content
 *   isn't hidden behind the tab bar.
 */

'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'
import { TopNav, type TopNavItem } from '@/components/design'
import { SwipeTabs } from '@/components/design/SwipeTabs'

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

// Swipe gets confused inside the flow builder (it has its own canvas drags),
// so we opt that route out.
const SWIPE_DISABLED = ['/dashboard/flows/']

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || ''
  const { data: session } = useSession()
  const user = session?.user as {
    name?: string; email?: string; workspaceName?: string; isSuperAdmin?: boolean
  } | undefined
  const workspaceName = user?.workspaceName || ''
  const isSuperAdmin = user?.isSuperAdmin || false

  const signOutBtn = (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="text-[12px] text-grey-35 hover:text-ink transition-colors px-2 py-1"
    >
      Sign out
    </button>
  )

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <TopNav
        items={NAV_ITEMS}
        workspaceName={workspaceName}
        user={{ name: user?.name, avatarUrl: null }}
        mobilePattern={MOBILE_PATTERN}
        mobileFooter={signOutBtn}
        cta={
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <Link
                href="/platform-admin"
                className="font-mono text-[10px] uppercase px-2.5 py-1 rounded-full border"
                style={{
                  letterSpacing: '0.1em',
                  color: 'var(--warn-fg)',
                  background: 'var(--warn-bg)',
                  borderColor: 'transparent',
                }}
              >
                Platform
              </Link>
            )}
            {signOutBtn}
          </div>
        }
      />

      <SwipeTabs items={NAV_ITEMS} disabledPaths={SWIPE_DISABLED}>
        <main
          className={`flex-1 w-full max-w-[1596px] mx-auto px-4 md:px-6 lg:px-[132px] py-6 md:py-8 ${
            pathname.endsWith('/builder') ? 'pt-0' : ''
          } ${MOBILE_PATTERN === 'bottom' ? 'pb-24 md:pb-8' : ''}`}
        >
          {children}
        </main>
      </SwipeTabs>
    </div>
  )
}
