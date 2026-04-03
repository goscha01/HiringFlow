'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const router = useRouter()

  const isSuperAdmin = (session?.user as any)?.isSuperAdmin

  useEffect(() => {
    if (status === 'authenticated' && !isSuperAdmin) {
      router.push('/admin/flows')
    }
  }, [status, isSuperAdmin, router])

  if (status === 'loading') return <div className="min-h-screen flex items-center justify-center bg-[#0f172a]"><div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
  if (!isSuperAdmin) return null

  const navItems = [
    { href: '/platform-admin', label: 'Dashboard' },
    { href: '/platform-admin/users', label: 'Users' },
    { href: '/platform-admin/workspaces', label: 'Workspaces' },
  ]

  return (
    <div className="min-h-screen bg-[#0f172a]">
      {/* Top banner */}
      <div className="bg-amber-500 text-black text-center py-2 text-xs font-semibold uppercase tracking-wider">
        Platform Admin — Super Admin Access
      </div>

      {/* Navbar */}
      <nav className="bg-[#1e293b] border-b border-[#334155]">
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="flex justify-between items-center h-[60px]">
            <div className="flex items-center gap-8">
              <Link href="/platform-admin" className="flex items-center gap-2">
                <div className="w-8 h-8 bg-amber-500 rounded-md flex items-center justify-center">
                  <svg className="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
                </div>
                <span className="text-white font-semibold text-sm">HireFunnel</span>
              </Link>
              <div className="flex items-center gap-1">
                {navItems.map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-4 py-2 rounded-md text-sm transition-colors ${
                      (item.href === '/platform-admin' ? pathname === item.href : pathname.startsWith(item.href))
                        ? 'bg-[#334155] text-white font-medium'
                        : 'text-[#94a3b8] hover:text-white'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/admin/flows" className="text-xs text-[#94a3b8] hover:text-white">
                Business View →
              </Link>
              <button onClick={() => signOut({ callbackUrl: '/login' })} className="text-sm text-[#94a3b8] hover:text-white">
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-[1400px] mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
