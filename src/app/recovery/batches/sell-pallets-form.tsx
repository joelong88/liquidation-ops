'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { callOpsApi } from '@/lib/ops/client'

type Pallet = { pallet_id: number; pallet_code: string }

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatWithCommas(digits: string) {
  if (!digits) return ''
  const [whole, frac] = digits.split('.')
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return frac !== undefined ? `${withCommas}.${frac}` : withCommas
}

export function SellPalletsForm({ pallets }: { pallets: Pallet[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [buyerName, setBuyerName] = useState('')
  const [amountDisplay, setAmountDisplay] = useState('')
  const [saleDate, setSaleDate] = useState(todayIso())
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleAmountChange(raw: string) {
    // Keep only digits and a single decimal point, then re-add thousands commas.
    let cleaned = raw.replace(/[^0-9.]/g, '')
    const firstDot = cleaned.indexOf('.')
    if (firstDot !== -1) {
      cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '')
    }
    setAmountDisplay(formatWithCommas(cleaned))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selected.size === 0 || pending) return
    setPending(true)
    setResult(null)

    const amount = Number(amountDisplay.replace(/,/g, ''))
    const r = await callOpsApi<{
      ok: boolean
      error?: string
      batch_id?: number
      sold_pallets: number[]
      skipped: unknown[]
    }>('pallet-sale', {
      pallet_ids: Array.from(selected),
      buyer_name: buyerName,
      sale_amount: amount,
      sale_date: saleDate,
    })

    if (!r.ok) {
      setResult({ ok: false, message: r.error ?? 'Failed.' })
    } else {
      setResult({
        ok: true,
        message: `Sold ${r.sold_pallets.length} pallet(s) into batch #${r.batch_id}${
          r.skipped.length > 0 ? ` (${r.skipped.length} skipped)` : ''
        }.`,
      })
      setSelected(new Set())
      setBuyerName('')
      setAmountDisplay('')
      setSaleDate(todayIso())
      router.refresh()
    }
    setPending(false)
  }

  if (pallets.length === 0) return null

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-neutral-900">
        Record Sale <span className="font-normal text-neutral-500">(bundle one or more endorsed pallets into a batch)</span>
      </h2>
      <div className="flex flex-wrap gap-2">
        {pallets.map((p) => (
          <label
            key={p.pallet_id}
            className="flex items-center gap-2 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-mono"
          >
            <input
              type="checkbox"
              checked={selected.has(p.pallet_id)}
              onChange={() => toggle(p.pallet_id)}
              className="h-5 w-5"
            />
            {p.pallet_code}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="sellBuyer" className="text-sm font-medium text-neutral-700">
            Winning buyer
          </label>
          <input
            id="sellBuyer"
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="sellAmount" className="text-sm font-medium text-neutral-700">
            Sale amount (₱)
          </label>
          <input
            id="sellAmount"
            inputMode="decimal"
            value={amountDisplay}
            onChange={(e) => handleAmountChange(e.target.value)}
            placeholder="35,000"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="saleDate" className="text-sm font-medium text-neutral-700">
            Sale date
          </label>
          <input
            id="saleDate"
            type="date"
            value={saleDate}
            onChange={(e) => setSaleDate(e.target.value)}
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={selected.size === 0 || pending}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Recording…' : `Record sale (${selected.size} pallet(s))`}
        </button>
      </div>
      {result && (
        <p className={result.ok ? 'text-sm text-green-700' : 'text-sm text-red-600'}>{result.message}</p>
      )}
    </form>
  )
}
