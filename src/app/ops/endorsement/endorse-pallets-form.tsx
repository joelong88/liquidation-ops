'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime } from '@/lib/format-date'
import { ConfirmButton } from '@/components/confirm-button'

type Pallet = {
  pallet_id: number
  pallet_code: string
  closed_at: string | null
  sack_count: number
  tid_count: number
  gmv: number
}

export function EndorsePalletsForm({ pallets }: { pallets: Pallet[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<number>>(new Set())
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

  async function handleSubmit() {
    if (selected.size === 0 || pending) return
    setPending(true)
    setResult(null)

    const supabase = createClient()
    const { data, error } = await supabase.rpc('endorse_pallets_to_admin', {
      p_pallet_ids: Array.from(selected),
    })

    if (error) {
      setResult({ ok: false, message: error.message })
    } else {
      const r = data as { ok: boolean; endorsed: number[]; skipped: unknown[] }
      setResult({
        ok: true,
        message: `Endorsed ${r.endorsed.length} of ${selected.size} pallet(s) to admin${
          r.skipped.length > 0 ? ` (${r.skipped.length} skipped)` : ''
        }.`,
      })
      setSelected(new Set())
      router.refresh()
    }
    setPending(false)
  }

  if (pallets.length === 0) {
    return <p className="text-sm text-neutral-400">No pallets currently ready to endorse.</p>
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border-2 border-amber-300 bg-amber-50 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-amber-900">
          Weekly digital endorsement — no scan
        </h3>
        <ConfirmButton
          onConfirm={handleSubmit}
          label={`Endorse selected (${selected.size})`}
          confirmLabel="Yes, endorse"
          pending={pending}
          disabled={selected.size === 0 || pending}
          className="rounded-md bg-amber-700 px-4 py-2 text-base font-medium text-white disabled:opacity-50"
        />
      </div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-amber-200 text-xs uppercase tracking-wide text-amber-700">
            <th className="py-2 pr-3"></th>
            <th className="py-2 pr-3">Pallet</th>
            <th className="py-2 pr-3">Closed</th>
            <th className="py-2 pr-3">Sacks</th>
            <th className="py-2 pr-3">TIDs</th>
            <th className="py-2">GMV</th>
          </tr>
        </thead>
        <tbody>
          {pallets.map((p) => (
            <tr key={p.pallet_id} className="border-b border-amber-100">
              <td className="py-2 pr-3">
                <input
                  type="checkbox"
                  checked={selected.has(p.pallet_id)}
                  onChange={() => toggle(p.pallet_id)}
                  className="h-4 w-4"
                />
              </td>
              <td className="py-2 pr-3 font-mono font-medium">{p.pallet_code}</td>
              <td className="py-2 pr-3">{p.closed_at ? formatDateTime(p.closed_at) : '—'}</td>
              <td className="py-2 pr-3">{p.sack_count}</td>
              <td className="py-2 pr-3">{p.tid_count}</td>
              <td className="py-2">₱{p.gmv.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {result && (
        <p className={result.ok ? 'text-sm text-green-800' : 'text-sm text-red-700'}>
          {result.message}
        </p>
      )}
    </div>
  )
}
