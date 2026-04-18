/**
 * useSwipeNav — touch/pointer gesture hook for horizontal page swipes between
 * sibling routes (e.g. dashboard tabs).
 *
 * Behavior
 * --------
 * - Tracks pointerdown → pointermove → pointerup on the element it's bound to.
 * - Reports a live `dx` (in CSS pixels, 0 when idle) so the consumer can
 *   render the drag in real time (no RAF, no DOM mutation from the hook).
 * - On release, decides: commit forward, commit back, or snap home.
 * - Uses a rubber-band falloff when dragging past the first/last page so the
 *   edge feels elastic instead of dead.
 * - Cancels on vertical drift — if the user's finger moves more vertically
 *   than horizontally, we bail so the page still scrolls normally.
 *
 * The hook is presentation-agnostic — it returns values, not styles. The
 * consumer (SwipeTabs) decides how to animate them.
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseSwipeNavArgs {
  /** Index of the current page (0-based) within the sibling set. */
  currentIndex: number
  /** Total number of pages in the sibling set. */
  total: number
  /** Called when the user commits a swipe. Delta is +1 (next) or −1 (prev). */
  onCommit: (nextIndex: number) => void
  /**
   * Fraction of the viewport width that counts as "committed" on release.
   * Default 0.28 — roughly 100px on a 360px screen.
   */
  threshold?: number
  /**
   * Velocity (px/ms) that will commit regardless of distance.
   * Default 0.45 — a reasonably quick flick.
   */
  velocityThreshold?: number
  /** Disable the hook entirely (e.g. when a modal is open). */
  disabled?: boolean
}

export interface UseSwipeNavReturn {
  /** Current live drag offset in pixels (0 when idle). */
  dx: number
  /** True while the user has an active pointer down. */
  dragging: boolean
  /**
   * Bind these onto the swipe container. They forward all pointer events we
   * care about; we use Pointer Events because they cover mouse + touch + pen
   * with one code path.
   */
  bind: {
    onPointerDown: (e: React.PointerEvent) => void
    onPointerMove: (e: React.PointerEvent) => void
    onPointerUp: (e: React.PointerEvent) => void
    onPointerCancel: (e: React.PointerEvent) => void
    style: React.CSSProperties
  }
}

// Rubber-band easing borrowed from iOS scroll physics. Resists progressively
// so a 300px overdrag translates to only ~60px of visual travel. Keeps the
// "edge of the world" feeling without blocking the drag outright.
function rubberBand(distance: number, dimension: number): number {
  if (dimension === 0) return 0
  const sign = Math.sign(distance)
  const abs = Math.abs(distance)
  return sign * (1 - 1 / (abs / dimension + 1)) * dimension
}

export function useSwipeNav({
  currentIndex,
  total,
  onCommit,
  threshold = 0.28,
  velocityThreshold = 0.45,
  disabled = false,
}: UseSwipeNavArgs): UseSwipeNavReturn {
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)

  // We track start position, last sample, and the element width in refs so
  // state updates don't churn on every pointermove (which fires at 120Hz
  // on modern iOS).
  const startX = useRef(0)
  const startY = useRef(0)
  const lastX = useRef(0)
  const lastT = useRef(0)
  const velocity = useRef(0)
  const width = useRef(0)
  // 'unset' until we see enough motion to decide axis. Once locked we stay
  // locked for the rest of the gesture — prevents scroll jank.
  const axis = useRef<'unset' | 'h' | 'v'>('unset')
  const activePointer = useRef<number | null>(null)

  const cleanup = useCallback(() => {
    setDragging(false)
    setDx(0)
    axis.current = 'unset'
    activePointer.current = null
    velocity.current = 0
  }, [])

  useEffect(() => { if (disabled) cleanup() }, [disabled, cleanup])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return
    // Ignore non-primary buttons (right-click, two-finger tap on trackpad).
    if (e.pointerType === 'mouse' && e.button !== 0) return
    activePointer.current = e.pointerId
    startX.current = e.clientX
    startY.current = e.clientY
    lastX.current = e.clientX
    lastT.current = performance.now()
    width.current = e.currentTarget.getBoundingClientRect().width
    axis.current = 'unset'
    setDragging(true)
  }, [disabled])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (activePointer.current !== e.pointerId) return
    const raw = e.clientX - startX.current
    const rawY = e.clientY - startY.current

    if (axis.current === 'unset') {
      // Don't lock until we've moved at least 6px in some direction — prevents
      // misreading a tap as a micro-swipe.
      if (Math.abs(raw) < 6 && Math.abs(rawY) < 6) return
      axis.current = Math.abs(raw) > Math.abs(rawY) ? 'h' : 'v'
      if (axis.current === 'v') {
        // User is scrolling the page, not swiping pages. Bow out.
        cleanup()
        return
      }
    }

    // Capture the pointer so drags continue even if the finger leaves the
    // element's bounds (common on small targets).
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId) } catch {}

    // Rubber-band at the edges.
    let effective = raw
    const atLeftEdge = currentIndex === 0 && raw > 0
    const atRightEdge = currentIndex === total - 1 && raw < 0
    if (atLeftEdge || atRightEdge) {
      effective = rubberBand(raw, width.current || 1)
    }

    // Velocity for flick detection (px/ms, exponentially smoothed).
    const now = performance.now()
    const dt = Math.max(1, now - lastT.current)
    const instant = (e.clientX - lastX.current) / dt
    velocity.current = velocity.current * 0.7 + instant * 0.3
    lastX.current = e.clientX
    lastT.current = now

    setDx(effective)
  }, [currentIndex, total, cleanup])

  const finish = useCallback((e: React.PointerEvent) => {
    if (activePointer.current !== e.pointerId) return
    const raw = e.clientX - startX.current
    const w = width.current || 1
    const distanceRatio = Math.abs(raw) / w
    const v = velocity.current
    const fastFlick = Math.abs(v) > velocityThreshold
    const committed = distanceRatio > threshold || fastFlick

    if (committed && raw < 0 && currentIndex < total - 1) {
      onCommit(currentIndex + 1)
    } else if (committed && raw > 0 && currentIndex > 0) {
      onCommit(currentIndex - 1)
    }
    cleanup()
  }, [currentIndex, total, threshold, velocityThreshold, onCommit, cleanup])

  return {
    dx,
    dragging,
    bind: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      // touch-action: pan-y lets vertical scrolling through but tells the
      // browser to let us handle horizontal gestures.
      style: { touchAction: 'pan-y' },
    },
  }
}
