'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/ops/first-scan', label: '1. First Scan' },
  { href: '/ops/inbound-ttxb-storage', label: '2. Inbound → TTXB Storage' },
  { href: '/ops/repack-ttxb-storage', label: '3. Repack (TTXB Storage)' },
  { href: '/ops/strip-ttxb-storage', label: '4. Strip (TTXB Storage)' },
  { href: '/ops/inbound-liquidation', label: '5. Inbound → Liquidation Area' },
  { href: '/ops/strip-liquidation', label: '6. Strip (Liquidation Area)' },
  { href: '/ops/endorsement', label: '7. Endorsement' },
  { href: '/ops/outbound-liquidation', label: '8. Outbound (Liquidation Area)' },
  { href: '/ops/force-success', label: '9. Force-Success List' },
  { href: '/ops/overview', label: '10. Overview' },
] as const

export function TabNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-wrap gap-1.5 border-b border-neutral-200 pb-3">
      {TABS.map((t) => {
        const active = pathname === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-md border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap ${
              active
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-300 text-neutral-700 hover:border-neutral-500'
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
