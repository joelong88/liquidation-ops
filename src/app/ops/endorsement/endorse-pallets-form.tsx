'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Pallet = { pallet_id: number; pallet_code: string }

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
    <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-amber-900">
          Weekly digital endorsement — no scan
        </h3>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={selected.size === 0 || pending}
          className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Endorsing…' : `Endorse selected (${selected.size})`}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {pallets.map((p) => (
          <label
            key={p.pallet_id}
            className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-mono"
          >
            <input
              type="checkbox"
              checked={selected.has(p.pallet_id)}
              onChange={() => toggle(p.pallet_id)}
            />
            {p.pallet_code}
          </label>
        ))}
      </div>
      {result && (
        <p className={result.ok ? 'text-xs text-green-800' : 'text-xs text-red-700'}>
          {result.message}
        </p>
      )}
    </div>
  )
}
