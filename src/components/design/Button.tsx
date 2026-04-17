/**
 * Button primitive — port of Design/design_handoff_hirefunnel/ui.jsx `Btn`.
 *
 * Variants: primary | secondary | ghost | danger
 * Sizes:    md (default) | sm
 *
 * Uses Tailwind classes that reference the refreshed design tokens. Legacy
 * `.btn-primary` / `.btn-secondary` / `.btn-ghost` utility classes in
 * globals.css are retained for unmodified call sites; prefer this component
 * going forward.
 */

import * as React from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  iconLeft?: React.ReactNode
  iconRight?: React.ReactNode
}

const BASE = 'inline-flex items-center justify-center gap-1.5 font-sans rounded-[10px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

const VARIANT: Record<Variant, string> = {
  primary:   'bg-brand-500 text-white font-semibold hover:bg-brand-600 border border-transparent',
  secondary: 'bg-transparent text-ink font-medium border border-surface-border hover:bg-surface-light',
  ghost:     'bg-transparent text-grey-35 font-medium border border-transparent hover:bg-surface-light',
  danger:    'bg-transparent text-[color:var(--danger-fg)] font-medium border border-surface-border hover:bg-[color:var(--danger-bg)]',
}

const SIZE: Record<Size, string> = {
  sm: 'text-[12px] px-3 py-1.5',
  md: 'text-[13px] px-4 py-2.5',
}

export function Button({ variant = 'primary', size = 'md', iconLeft, iconRight, className = '', children, ...rest }: ButtonProps) {
  return (
    <button {...rest} className={`${BASE} ${VARIANT[variant]} ${SIZE[size]} ${className}`.trim()}>
      {iconLeft}
      {children}
      {iconRight}
    </button>
  )
}
