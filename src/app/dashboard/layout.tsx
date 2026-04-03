'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const workspaceName = (session?.user as any)?.workspaceName || ''
  const isSuperAdmin = (session?.user as any)?.isSuperAdmin || false

  const navItems = [
    { href: '/dashboard/candidates', label: 'Candidates' },
    { href: '/dashboard/flows', label: 'Flows' },
    { href: '/dashboard/campaigns', label: 'Campaigns' },
    { href: '/dashboard/automations', label: 'Automations' },
    { href: '/dashboard/trainings', label: 'Trainings' },
    { href: '/dashboard/scheduling', label: 'Scheduling' },
    { href: '/dashboard/analytics', label: 'Analytics' },
  ]

  return (
    <div className="min-h-screen bg-surface">
      {/* Top banner */}
      <div className="bg-brand-500 text-white text-center py-3 text-sm font-normal">
        HireFunnel — Application Flows & Training Platform
      </div>

      {/* Navbar */}
      <nav className="bg-white border-b border-surface-border">
        <div className="max-w-[1596px] mx-auto px-6 lg:px-[132px]">
          <div className="flex justify-between items-center h-[72px]">
            {/* Left: Logo + Nav */}
            <div className="flex items-center gap-[50px]">
              {/* Logo */}
              <Link href="/dashboard/flows" className="flex-shrink-0">
                <div className="w-[44px] h-[44px] bg-brand-500 rounded-[8px] flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/>
                  </svg>
                </div>
              </Link>

              {/* Nav items */}
              <div className="flex items-center gap-1">
                {navItems.map((item) => {
                  const isActive = pathname.startsWith(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`px-5 py-2.5 rounded-[8px] text-[15px] font-normal transition-colors ${
                        isActive
                          ? 'bg-surface text-grey-15 font-medium'
                          : 'text-grey-35 hover:text-grey-15 hover:bg-surface-light'
                      }`}
                    >
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </div>

            {/* Right: Workspace + Platform Admin + Sign out */}
            <div className="flex items-center gap-4">
              {workspaceName && (
                <span className="text-[13px] text-grey-40 bg-surface px-3 py-1.5 rounded-[8px]">{workspaceName}</span>
              )}
              {isSuperAdmin && (
                <Link href="/platform-admin" className="text-[13px] text-amber-600 bg-amber-50 px-3 py-1.5 rounded-[8px] font-medium hover:bg-amber-100">
                  Platform Admin
                </Link>
              )}
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="text-[15px] text-grey-35 hover:text-grey-15 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-[1596px] mx-auto px-6 lg:px-[132px] py-10">
        {children}
      </main>
    </div>
  )
}
