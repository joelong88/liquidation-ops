'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Sack = { sack_id: number; sack_code: string; shipper_segment: string | null }
type NoAwbParcel = { tid: string; cod_value: number | null }

export function ConsolidatePalletForm({
  sacks,
  noAwbParcels,
}: {
  sacks: Sack[]
  noAwbParcels: NoAwbParcel[]
}) {
  const router = useRouter()
  const [palletCode, setPalletCode] = useState('')
  const [selectedSacks, setSelectedSacks] = useState<Set<string>>(new Set())
  const [selectedTids, setSelectedTids] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  function toggleSack(code: string) {
    setSelectedSacks((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  function toggleTid(tid: string) {
    setSelectedTids((prev) => {
      const next = new Set(prev)
      if (next.has(tid)) next.delete(tid)
      else next.add(tid)
      return next
    })
  }

  async function handleSubmit() {
    const code = palletCode.trim()
    if (!code || (selectedSacks.size === 0 && selectedTids.size === 0) || pending) return
    setPending(true)
    setResult(null)

    const supabase = createClient()
    const { data, error } = await supabase.rpc('assign_pallet', {
      p_pallet_code: code,
      p_sack_codes: Array.from(selectedSacks),
      p_tids: Array.from(selectedTids),
    })

    if (error) {
      setResult({ ok: false, message: error.message })
    } else {
      const r = data as {
        ok: boolean
        error?: string
        added_sacks: string[]
        added_tids: string[]
        skipped: { sack_code?: string; tid?: string; reason: string }[]
      }
      if (!r.ok) {
        setResult({ ok: false, message: r.error ?? 'Failed.' })
      } else {
        setResult({
          ok: true,
          message: `Pallet ${code}: ${r.added_sacks.length} sack(s) + ${r.added_tids.length} NO-AWB TID(s) added${
            r.skipped.length > 0 ? ` (${r.skipped.length} skipped — see console)` : ''
          }.`,
        })
        if (r.skipped.length > 0) console.log('Skipped:', r.skipped)
        setSelectedSacks(new Set())
        setSelectedTids(new Set())
        router.refresh()
      }
    }
    setPending(false)
  }

  const totalSelected = selectedSacks.size + selectedTids.size

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <label htmlFor="palletCode" className="text-sm font-medium text-neutral-700">
          Pallet ID
        </label>
        <input
          id="palletCode"
          value={palletCode}
          onChange={(e) => setPalletCode(e.target.value)}
          placeholder="Scan or type pallet ID"
          autoComplete="off"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-mono"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!palletCode.trim() || totalSelected === 0 || pending}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Assembling…' : `Assemble (${totalSelected} selected)`}
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

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Stripped TTXB sacks, ready for a pallet
        </h3>
        <table className="w-full max-w-2xl text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-2">
                <input
                  type="checkbox"
                  checked={sacks.length > 0 && selectedSacks.size === sacks.length}
                  onChange={() =>
                    setSelectedSacks((prev) =>
                      prev.size === sacks.length ? new Set() : new Set(sacks.map((s) => s.sack_code))
                    )
                  }
                />
              </th>
              <th className="py-2 pr-4">Sack</th>
              <th className="py-2">Segment</th>
            </tr>
          </thead>
          <tbody>
            {sacks.map((s) => (
              <tr key={s.sack_id} className="border-b border-neutral-100">
                <td className="py-2 pr-2">
                  <input
                    type="checkbox"
                    checked={selectedSacks.has(s.sack_code)}
                    onChange={() => toggleSack(s.sack_code)}
                  />
                </td>
                <td className="py-2 pr-4 font-mono">{s.sack_code}</td>
                <td className="py-2">{s.shipper_segment ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sacks.length === 0 && (
          <p className="text-sm text-neutral-400">No stripped TTXB sacks waiting for a pallet.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          NO-AWB parcels (no sack — assigned directly)
        </h3>
        <table className="w-full max-w-2xl text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-2">
                <input
                  type="checkbox"
                  checked={noAwbParcels.length > 0 && selectedTids.size === noAwbParcels.length}
                  onChange={() =>
                    setSelectedTids((prev) =>
                      prev.size === noAwbParcels.length
                        ? new Set()
                        : new Set(noAwbParcels.map((p) => p.tid))
                    )
                  }
                />
              </th>
              <th className="py-2 pr-4">TID</th>
              <th className="py-2">Value</th>
            </tr>
          </thead>
          <tbody>
            {noAwbParcels.map((p) => (
              <tr key={p.tid} className="border-b border-neutral-100">
                <td className="py-2 pr-2">
                  <input
                    type="checkbox"
                    checked={selectedTids.has(p.tid)}
                    onChange={() => toggleTid(p.tid)}
                  />
                </td>
                <td className="py-2 pr-4 font-mono">{p.tid}</td>
                <td className="py-2">
                  {p.cod_value != null ? `₱${Number(p.cod_value).toLocaleString()}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {noAwbParcels.length === 0 && (
          <p className="text-sm text-neutral-400">No unassigned NO-AWB parcels.</p>
        )}
      </section>
    </div>
  )
}
