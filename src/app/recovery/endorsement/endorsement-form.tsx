'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Parcel = {
  tid: string
  item_type: string | null
  cod_value: number | null
  current_stage: string
  shipper_segment: string
  hold_until: string | null
  hold_forced_success: boolean
}

type OpenBatch = { batch_id: number; batch_number: number; batch_type: string }

export function EndorsementForm({
  parcels,
  openBatches,
}: {
  parcels: Parcel[]
  openBatches: OpenBatch[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchChoice, setBatchChoice] = useState('new')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  function toggle(tid: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(tid)) next.delete(tid)
      else next.add(tid)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === parcels.length ? new Set() : new Set(parcels.map((p) => p.tid))))
  }

  async function handleSubmit() {
    if (selected.size === 0 || pending) return
    setPending(true)
    setResult(null)

    const supabase = createClient()
    const { data, error } = await supabase.rpc('endorse_parcels_to_batch', {
      p_tids: Array.from(selected),
      p_batch_id: batchChoice === 'new' ? undefined : Number(batchChoice),
    })

    if (error) {
      setResult({ ok: false, message: error.message })
    } else {
      const r = data as { ok: boolean; batch_id: number; endorsed: string[]; skipped: unknown[] }
      setResult({
        ok: true,
        message: `Endorsed ${r.endorsed.length} of ${selected.size} into batch #${r.batch_id}${
          r.skipped.length > 0 ? ` (${r.skipped.length} skipped — see console)` : ''
        }.`,
      })
      if (r.skipped.length > 0) console.log('Skipped:', r.skipped)
      setSelected(new Set())
      router.refresh()
    }
    setPending(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-neutral-700">Target batch</label>
        <select
          value={batchChoice}
          onChange={(e) => setBatchChoice(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
        >
          <option value="new">Create new batch</option>
          {openBatches.map((b) => (
            <option key={b.batch_id} value={b.batch_id}>
              Batch {b.batch_number} ({b.batch_type})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={selected.size === 0 || pending}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Endorsing…' : `Endorse selected (${selected.size})`}
        </button>
      </div>

      {result && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            result.ok
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {result.message}
        </div>
      )}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
            <th className="py-2 pr-2">
              <input
                type="checkbox"
                checked={parcels.length > 0 && selected.size === parcels.length}
                onChange={toggleAll}
              />
            </th>
            <th className="py-2 pr-4">TID</th>
            <th className="py-2 pr-4">Type</th>
            <th className="py-2 pr-4">Segment</th>
            <th className="py-2 pr-4">Stage</th>
            <th className="py-2">COD</th>
          </tr>
        </thead>
        <tbody>
          {parcels.map((p) => (
            <tr key={p.tid} className="border-b border-neutral-100">
              <td className="py-2 pr-2">
                <input
                  type="checkbox"
                  checked={selected.has(p.tid)}
                  onChange={() => toggle(p.tid)}
                />
              </td>
              <td className="py-2 pr-4 font-mono">{p.tid}</td>
              <td className="py-2 pr-4">{p.item_type ?? '—'}</td>
              <td className="py-2 pr-4">{p.shipper_segment}</td>
              <td className="py-2 pr-4">{p.current_stage}</td>
              <td className="py-2">
                {p.cod_value != null ? `₱${Number(p.cod_value).toLocaleString()}` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {parcels.length === 0 && (
        <p className="text-sm text-neutral-400">No parcels currently eligible for endorsement.</p>
      )}
    </div>
  )
}
