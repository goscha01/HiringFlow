/**
 * MobileNav — the mobile nav for the Hirefunnel dashboard.
 *
 * Pattern: side drawer. Renders a hamburger button that's visible only below
 * the `md` breakpoint (< 768px). Tapping opens a full-height panel sliding in
 * from the right containing:
 *
 *   - a user card header (name + email + avatar)
 *   - every top-level tab, stacked vertically, active tab highlighted
 *   - an optional footer slot (typically "Sign out" + build stamp)
 *
 * Why a drawer (and not a bottom bar or pill strip):
 *
 *   - Ten tabs don't fit a bottom bar's four-item budget without a "More"
 *     sheet — awkward two-level UX for sparing one tap.
 *   - Drawer scales if we add a Billing or Integrations tab later.
 *   - Puts Sign out and user context one interaction away without owning any
 *     screen real-estate during normal use.
 *
 * Accessibility:
 *
 *   - `role="dialog"` + `aria-modal="true"` on the panel.
 *   - Focus moves to the active item on open and returns to the trigger on
 *     close.
 *   - Esc, scrim tap, and the explicit close button all dismiss.
 *   - Background scroll is locked while open.
 *
 * The component consumes the same `TopNavItem[]` shape the desktop TopNav
 * uses — config stays single-source in `dashboard/layout.tsx`.
 */

'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { TopNavItem } from './TopNav'

export interface MobileNavProps {
  items: TopNavItem[]
  workspaceName?: string
  user?: { name?: string; email?: string; avatarUrl?: string | null }
  /** Usually a "Sign out" button + version stamp. */
  footer?: React.ReactNode
}

function isActivePath(pathname: string, it: TopNavItem) {
  const prefixes = [it.href, ...(it.matches || [])]
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

function initialsFromName(name?: string): string {
  if (!name) return ''
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ───── Inline glyphs — no icon-lib dependency ─────
function HamburgerGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  )
}
function CloseGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M6 6l12 12M6 18 18 6" />
    </svg>
  )
}

export function MobileNav({ items, workspaceName, user, footer }: MobileNavProps) {
  const [open, setOpen] = React.useState(false)
  const pathname = usePathname() || ''
  const panelRef = React.useRef<HTMLDivElement | null>(null)
  const triggerRef = React.useRef<HTMLButtonElement | null>(null)

  // Lock body scroll while open — otherwise iOS lets the page scroll
  // behind the scrim, which reads as "the drawer is broken".
  React.useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Esc closes. Focus moves to the active item on open, returns to trigger on close.
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    const panel = panelRef.current
    const first = panel?.querySelector<HTMLElement>('[data-active="true"]')
      ?? panel?.querySelector<HTMLElement>('a, button')
    first?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  React.useEffect(() => {
    // Auto-close on route change so tapping a link doesn't leave the drawer
    // hovering over the new page.
    setOpen(false)
  }, [pathname])

  const userName = user?.name
  const initials = initialsFromName(userName)

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="hirefunnel-mobile-drawer"
        className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-[10px] text-ink hover:bg-surface-light transition-colors"
      >
        <HamburgerGlyph />
      </button>

      {/* Scrim */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden
        className={`md:hidden fixed inset-0 z-[60] transition-opacity duration-200 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'rgba(23,23,26,0.35)', backdropFilter: 'blur(2px)' }}
      />

      {/* Panel */}
      <aside
        id="hirefunnel-mobile-drawer"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
        className={`md:hidden fixed top-0 right-0 bottom-0 z-[61] w-[82%] max-w-[360px] flex flex-col bg-white transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ boxShadow: '-20px 0 40px -20px rgba(0,0,0,0.2)' }}
      >
        {/* Header — user card */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-surface-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-[12px] overflow-hidden shrink-0"
              style={{ background: 'var(--ink)' }}
            >
              {user?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt={userName || ''} className="w-full h-full object-cover" />
              ) : initials}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-ink truncate">{userName || 'Signed in'}</div>
              <div className="text-[11px] text-grey-50 truncate">
                {user?.email || workspaceName || ''}
              </div>
            </div>
          </div>
          <button
            onClick={() => { setOpen(false); triggerRef.current?.focus() }}
            aria-label="Close menu"
            className="w-10 h-10 rounded-[10px] inline-flex items-center justify-center text-ink hover:bg-surface-light transition-colors"
          >
            <CloseGlyph />
          </button>
        </div>

        {/* Link list */}
        <nav className="flex-1 overflow-y-auto p-2">
          {items.map((it) => {
            const active = isActivePath(pathname, it)
            return (
              <Link
                key={it.href}
                href={it.href}
                data-active={active || undefined}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-3 rounded-[10px] text-[14px] font-medium transition-colors ${
                  active ? 'text-[var(--brand-ink)]' : 'text-grey-25 hover:bg-surface-light hover:text-ink'
                }`}
                style={active ? { background: 'var(--brand-dim)' } : undefined}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full transition-opacity"
                  style={{
                    background: 'var(--brand-primary)',
                    opacity: active ? 1 : 0,
                  }}
                />
                {it.label}
              </Link>
            )
          })}
        </nav>

        {footer && (
          <div className="px-4 py-3 border-t border-surface-border text-[12px] text-grey-35 flex items-center justify-between">
            {footer}
          </div>
        )}
      </aside>
    </>
  )
}
