/**
 * TopNav (responsive) — brand + tabs + search + CTA + avatar.
 *
 * Three breakpoints:
 *
 *   < md (768px)     — Mobile. Tabs hide; a MobileNav drawer + search icon
 *                      take over. Search collapses to icon-only.
 *   md → xl          — Narrow desktop / tablet. Two-row layout: row 1 keeps
 *                      brand, search, CTA, avatar; row 2 is a dedicated tab
 *                      strip (scrolls horizontally as a last resort). This
 *                      avoids the single-row scrolling bug between ~820px
 *                      and ~1120px where all 10 tabs could not fit.
 *   xl+ (1280px)     — Full desktop. Single 60px row with inline tabs,
 *                      exactly as before.
 *
 * Wordmark kept as "HireFunnel" (capital F) per product decision; the
 * design source uses "Hirefunnel".
 */

'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from './Button'
import { MobileNav } from './MobileNav'

export interface TopNavItem {
  label: string
  href: string
  matches?: string[]        // additional path prefixes that count as active
}

export interface TopNavProps {
  items: TopNavItem[]
  workspaceName?: string
  user?: { name?: string; email?: string; initials?: string; avatarUrl?: string | null }
  current?: string
  cta?: React.ReactNode
  onSearch?: () => void
  className?: string
  /** Footer slot passed through to MobileNav (usually "Sign out"). */
  mobileFooter?: React.ReactNode
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
  mobileFooter,
}: TopNavProps) {
  const pathname = usePathname() || ''
  const isActive = (it: TopNavItem) => {
    if (current) return current === it.label
    const prefixes = [it.href, ...(it.matches || [])]
    return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p))
  }
  const initials = user?.initials || initialsFromName(user?.name)

  // Tab row — reused in both inline (xl+) and second-row (md→xl) placement.
  const tabRow = (
    <nav className="flex gap-0.5 items-center">
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
  )

  return (
    <header
      className={`bg-white border-b border-surface-border shrink-0 ${className}`.trim()}
    >
      {/* Row 1: brand (+ inline tabs on xl+) + right cluster */}
      <div className="h-[60px] flex items-center gap-3 xl:gap-7 px-4 md:px-6">
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
              className="hidden sm:inline-block ml-1.5 font-mono text-[10px] uppercase text-grey-35 px-2 py-0.5 rounded-full border border-surface-border"
              style={{ letterSpacing: '0.08em' }}
              title={workspaceName}
            >
              {workspaceName.length > 14 ? workspaceName.slice(0, 14) + '…' : workspaceName}
            </span>
          )}
        </div>

        {/* Inline tabs — xl+ only (desktop wide). On md→xl, tabs live in row 2. */}
        <nav className="hidden xl:flex gap-0.5 flex-1 items-center overflow-x-auto">
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

        {/* Spacer when tabs are NOT inline (mobile and md→xl). */}
        <div className="flex-1 xl:hidden" />

        {/* Right cluster */}
        <div className="flex items-center gap-2 md:gap-2.5 shrink-0">
          {onSearch && (
            <>
              <Button variant="secondary" size="sm" onClick={onSearch} className="hidden md:inline-flex">
                <span className="font-mono text-[10px] opacity-70">⌘K</span>
                <span>Search</span>
              </Button>
              <button
                onClick={onSearch}
                aria-label="Search"
                className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-[10px] text-ink hover:bg-surface-light transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </button>
            </>
          )}
          {/* CTA block — desktop only (mobile gets it via MobileNav footer if needed) */}
          <div className="hidden md:inline-flex">{cta}</div>
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
          <MobileNav
            items={items}
            workspaceName={workspaceName}
            user={user ? { name: user.name, email: user.email, avatarUrl: user.avatarUrl } : undefined}
            footer={mobileFooter}
          />
        </div>
      </div>

      {/* Row 2 — tab strip, only visible md → xl. */}
      <div
        className="hidden md:block xl:hidden border-t border-surface-border"
        style={{ background: 'var(--surface-light, #FCFAF6)' }}
      >
        <div className="h-12 px-4 md:px-6 flex items-center overflow-x-auto">
          {tabRow}
        </div>
      </div>
    </header>
  )
}
