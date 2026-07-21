'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Pallet = { pallet_id: number; pallet_code: string }

export function SellPalletsForm({ pallets }: { pallets: Pallet[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [buyerName, setBuyerName] = useState('')
  const [amount, setAmount] = useState('')
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selected.size === 0 || pending) return
    setPending(true)
    setResult(null)

    const supabase = createClient()
    const { data, error } = await supabase.rpc('record_pallet_sale', {
      p_pallet_ids: Array.from(selected),
      p_buyer_name: buyerName,
      p_sale_amount: Number(amount),
    })

    if (error) {
      setResult({ ok: false, message: error.message })
    } else {
      const r = data as {
        ok: boolean
        error?: string
        batch_id?: number
        sold_pallets: number[]
        skipped: unknown[]
      }
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
        setAmount('')
        router.refresh()
      }
    }
    setPending(false)
  }

  if (pallets.length === 0) return null

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-md border border-neutral-200 p-4"
    >
      <h2 className="text-sm font-semibold text-neutral-900">
        Sell endorsed pallets (bundle one or more into a batch)
      </h2>
      <div className="flex flex-wrap gap-2">
        {pallets.map((p) => (
          <label
            key={p.pallet_id}
            className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-2 py-1 text-xs font-mono"
          >
            <input type="checkbox" checked={selected.has(p.pallet_id)} onChange={() => toggle(p.pallet_id)} />
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
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
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
