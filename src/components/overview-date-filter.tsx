'use client'

import { useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export function OverviewDateFilter({
  defaultFrom,
  defaultTo,
}: {
  defaultFrom: string
  defaultTo: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [from, setFrom] = useState(searchParams.get('from') ?? defaultFrom)
  const [to, setTo] = useState(searchParams.get('to') ?? defaultTo)

  function apply(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams(searchParams.toString())
    params.set('from', from)
    params.set('to', to)
    router.push(`${pathname}?${params.toString()}`)
  }

  function reset() {
    setFrom(defaultFrom)
    setTo(defaultTo)
    const params = new URLSearchParams(searchParams.toString())
    params.delete('from')
    params.delete('to')
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <form onSubmit={apply} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="rangeFrom" className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          From
        </label>
        <input
          id="rangeFrom"
          type="date"
          value={from}
          max={to}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="rangeTo" className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          To
        </label>
        <input
          id="rangeTo"
          type="date"
          value={to}
          min={from}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
        />
      </div>
      <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
        Apply
      </button>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-500"
      >
        Reset (last 7 days)
      </button>
    </form>
  )
}
