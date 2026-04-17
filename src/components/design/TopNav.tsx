/**
 * TopNav primitive — port of Design/design_handoff_hirefunnel/ui.jsx `TopNav`.
 *
 * 60px top bar: logo + workspace pill + nav tabs + search + CTA + avatar.
 * Accepts a current-section hint; otherwise derives active tab from the
 * pathname via Next's usePathname.
 */

'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from './Button'

export interface TopNavItem {
  label: string
  href: string
  matches?: string[]        // additional path prefixes that count as active
}

export interface TopNavProps {
  items: TopNavItem[]
  workspaceName?: string    // renders the small mono pill next to the logo
  user?: { name?: string; initials?: string; avatarUrl?: string | null }
  current?: string          // optional override for active-tab label
  cta?: React.ReactNode     // right-side action (e.g. "+ New flow")
  onSearch?: () => void
  className?: string
}

function initialsFromName(name?: string): string {
  if (!name) return ''
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function TopNav({
  items,
  workspaceName,
  user,
  current,
  cta,
  onSearch,
  className = '',
}: TopNavProps) {
  const pathname = usePathname() || ''
  const isActive = (it: TopNavItem) => {
    if (current) return current === it.label
    const prefixes = [it.href, ...(it.matches || [])]
    return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p))
  }
  const initials = user?.initials || initialsFromName(user?.name)

  return (
    <header
      className={`h-[60px] flex items-center gap-7 px-6 bg-white border-b border-surface-border shrink-0 ${className}`.trim()}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 shrink-0">
        <Link href={items[0]?.href || '/dashboard'} className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-[8px] flex items-center justify-center text-white font-bold text-[15px]"
            style={{ background: 'var(--brand-primary)', boxShadow: 'var(--shadow-brand)' }}
          >
            h
          </div>
          <span className="font-semibold text-[15px] text-ink tracking-[-0.01em]">HireFunnel</span>
        </Link>
        {workspaceName && (
          <span
            className="ml-1.5 font-mono text-[10px] uppercase text-grey-35 px-2 py-0.5 rounded-full border border-surface-border"
            style={{ letterSpacing: '0.08em' }}
            title={workspaceName}
          >
            {workspaceName.length > 14 ? workspaceName.slice(0, 14) + '…' : workspaceName}
          </span>
        )}
      </div>

      {/* Nav tabs */}
      <nav className="flex gap-0.5 flex-1 items-center overflow-x-auto">
        {items.map((it) => {
          const active = isActive(it)
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`px-3 py-2 text-[14px] font-medium rounded-[8px] whitespace-nowrap transition-colors ${
                active ? 'text-ink' : 'text-grey-35 hover:text-ink hover:bg-surface-light'
              }`}
              style={active ? { background: 'var(--brand-dim)' } : undefined}
            >
              {it.label}
            </Link>
          )
        })}
      </nav>

      {/* Right: search + CTA + avatar */}
      <div className="flex items-center gap-2.5 shrink-0">
        {onSearch && (
          <Button variant="secondary" size="sm" onClick={onSearch}>
            <span className="font-mono text-[10px] opacity-70">⌘K</span>
            <span>Search</span>
          </Button>
        )}
        {cta}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-[12px] overflow-hidden"
          style={{ background: 'var(--ink)' }}
          title={user?.name}
        >
          {user?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt={user.name || ''} className="w-full h-full object-cover" />
          ) : (
            initials
          )}
        </div>
      </div>
    </header>
  )
}
