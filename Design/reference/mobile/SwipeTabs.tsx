/**
 * SwipeTabs — swipe-to-navigate wrapper for sibling routes (e.g. dashboard
 * tabs). Drop it inside a Next.js layout and pass the same `items` array
 * you give to TopNav.
 *
 * It figures out which tab is "current" from the pathname, renders
 * `children` inside a transform-translated container, and routes to the
 * next/prev sibling when the user commits a swipe.
 *
 * Non-goals
 * ---------
 * - We do NOT preload adjacent routes — Next 14 prefetches <Link> siblings
 *   in the viewport automatically, which is enough.
 * - We do NOT snapshot the outgoing page to render beside the incoming
 *   one. The commit animation is: drag → snap transform back to 0 → route
 *   change → new page renders. Reads as "carded" on iOS-class devices.
 */

'use client'

import * as React from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { TopNavItem } from '@/components/design'
import { useSwipeNav } from './useSwipeNav'

export interface SwipeTabsProps {
  items: TopNavItem[]
  children: React.ReactNode
  /** Below this viewport width, swipe is enabled. Default 768 (md). */
  mobileBreakpoint?: number
  /** Disable in specific routes (e.g. flow builder). */
  disabledPaths?: string[]
}

function matchIndex(pathname: string, items: TopNavItem[]): number {
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const prefixes = [it.href, ...(it.matches || [])]
    if (prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'))) return i
  }
  return -1
}

export function SwipeTabs({ items, children, mobileBreakpoint = 768, disabledPaths }: SwipeTabsProps) {
  const router = useRouter()
  const pathname = usePathname() || ''
  const currentIndex = matchIndex(pathname, items)

  // Only enable below the breakpoint — desktop keeps native click nav.
  const [isMobile, setIsMobile] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${mobileBreakpoint - 1}px)`)
    const sync = () => setIsMobile(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [mobileBreakpoint])

  const disabled =
    !isMobile ||
    currentIndex === -1 ||
    (disabledPaths ?? []).some((p) => pathname === p || pathname.startsWith(p + '/'))

  // Released → snap back before navigating. We keep a snap-back state so the
  // settle animation feels continuous with the drag.
  const [snapping, setSnapping] = React.useState(false)

  const onCommit = React.useCallback((nextIndex: number) => {
    const target = items[nextIndex]
    if (!target) return
    setSnapping(true)
    // Small delay lets the drag transform animate to 0 before route swap.
    window.setTimeout(() => {
      router.push(target.href)
      // Snap state clears when the new page mounts (see effect below).
    }, 180)
  }, [items, router])

  // When the pathname changes, clear the snapping lock.
  React.useEffect(() => { setSnapping(false) }, [pathname])

  const { dx, dragging, bind } = useSwipeNav({
    currentIndex,
    total: items.length,
    onCommit,
    disabled,
  })

  const transform = snapping ? 'translateX(0)' : `translateX(${dx}px)`
  const transition = dragging && !snapping
    ? 'none'
    : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)'

  return (
    <div
      {...bind}
      // Height: we let the child define its own. We only need a hint so
      // the transform container stacks correctly.
      style={{ ...bind.style, position: 'relative', minHeight: 'calc(100vh - 60px)' }}
    >
      <div style={{ transform, transition, willChange: 'transform' }}>
        {children}
      </div>
      {/* Edge hint: when user drags, show a subtle arrow that fades in with
          the drag distance. Purely cosmetic; positioned absolutely so it
          doesn't affect layout. */}
      {dragging && Math.abs(dx) > 24 && (
        <div
          aria-hidden
          className="fixed top-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            [dx < 0 ? 'right' : 'left']: 16,
            opacity: Math.min(1, Math.abs(dx) / 120),
            color: 'var(--brand-fg)',
            transition: 'opacity 80ms linear',
          } as React.CSSProperties}
        >
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center"
            style={{ background: 'var(--brand-dim)', boxShadow: '0 6px 20px -6px rgba(255,149,0,0.4)' }}
          >
            {dx < 0 ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m9 6 6 6-6 6" /></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m15 6-6 6 6 6" /></svg>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
