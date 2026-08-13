'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const GROUPS = [
  {
    label: null,
    accent: 'border-neutral-300',
    tabs: [
      { href: '/ops/data-source', label: '0. Data Source' },
      { href: '/ops/first-scan', label: '1. First Scan' },
    ],
  },
  {
    label: 'TTXB Storage flow',
    accent: 'border-blue-300',
    tabs: [
      { href: '/ops/inbound-ttxb-storage', label: '2. Inbound → TTXB Storage' },
      { href: '/ops/repack-ttxb-storage', label: '3. Repack (TTXB Storage)' },
      { href: '/ops/strip-ttxb-storage', label: '4. Strip & Consolidate (TTXB Storage)' },
    ],
  },
  {
    label: 'Non-TTXB / Liquidation Area flow',
    accent: 'border-green-300',
    tabs: [
      { href: '/ops/new-arrival-liquidation', label: '5. New Arrival (Liquidation Area)' },
      { href: '/ops/strip-liquidation', label: '6. Strip & Consolidate (Liquidation Area)' },
    ],
  },
  {
    label: 'Shared',
    accent: 'border-neutral-300',
    tabs: [
      { href: '/ops/endorsement', label: '7. Endorsement' },
      { href: '/ops/outbound-liquidation', label: '8. Outbound (Liquidation Area)' },
      { href: '/ops/force-success', label: '9. Force-Success List' },
    ],
  },
] as const

export function TabNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-2 border-b border-neutral-200 pb-3">
      {GROUPS.map((group, i) => (
        <div
          key={group.label ?? `ungrouped-${i}`}
          className={`flex flex-wrap items-center gap-1.5 ${
            group.label ? `rounded-md border-l-4 ${group.accent} bg-neutral-50 py-1.5 pl-2 pr-1.5` : ''
          }`}
        >
          {group.label && (
            <span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              {group.label}
            </span>
          )}
          {group.tabs.map((t) => {
            const active = pathname === t.href
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-md border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap ${
                  active
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500'
                }`}
              >
                {t.label}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
