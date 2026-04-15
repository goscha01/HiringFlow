'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface SubNavItem { href: string; label: string }

export function SubNav({ items }: { items: SubNavItem[] }) {
  const pathname = usePathname()
  return (
    <div className="flex items-center gap-1 mb-6 border-b border-surface-border">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/')
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active
                ? 'border-brand-500 text-grey-15'
                : 'border-transparent text-grey-40 hover:text-grey-20'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}
