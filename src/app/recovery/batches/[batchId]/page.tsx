import { notFound } from 'next/navigation'
import { requireRole, AccessRestricted } from '@/lib/supabase/role-gate'
import { createClient } from '@/lib/supabase/server'
import { RecordBidForm } from '@/app/recovery/batches/[batchId]/record-bid-form'
import { BackLink } from '@/components/back-link'

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ batchId: string }>
}) {
  const { batchId } = await params
  const profile = await requireRole(['recovery_team', 'finance_team', 'owner'])
  if (!profile) return <AccessRestricted />

  const supabase = await createClient()
  const { data: batch } = await supabase
    .from('batch')
    .select('*')
    .eq('batch_id', Number(batchId))
    .single()

  if (!batch) notFound()

  const { data: parcels } = await supabase
    .from('parcel')
    .select('tid, item_type, effective_value, is_synthetic_tid')
    .eq('batch_id', batch.batch_id)
    .order('tid')

  const { data: sale } = await supabase
    .from('sale')
    .select('*')
    .eq('batch_id', batch.batch_id)
    .maybeSingle()

  // Ceiling = live sum of GMV (effective_value = COD or manual estimate) across this
  // batch's actual parcels, rather than the batch.ceiling_price column — that column
  // is only ever refreshed by recompute_batch_pricing (which also only sums cod_value,
  // missing manually-valued NO-AWB parcels) and can go stale.
  const totalTids = parcels?.length ?? 0
  const ceilingSum = (parcels ?? []).reduce((sum, p) => sum + (Number(p.effective_value) || 0), 0)
  const avgGmv = totalTids > 0 ? ceilingSum / totalTids : null
  const recoveryRate = sale && ceilingSum > 0 ? (sale.sale_amount / ceilingSum) * 100 : null

  return (
    <main className="flex min-h-screen flex-col gap-6 p-6">
      <div>
        <BackLink href="/recovery/batches" label="Batches" />
        <h1 className="text-lg font-semibold text-neutral-900">
          Batch {batch.batch_number} <span className="text-neutral-400">({batch.status})</span>
        </h1>
        <p className="text-sm text-neutral-500">
          {batch.batch_type} · {totalTids} parcels
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-md border border-neutral-200 p-3">
          <div className="text-xs uppercase text-neutral-500">Ceiling price (sum GMV)</div>
          <div className="text-lg font-semibold">₱{ceilingSum.toLocaleString()}</div>
        </div>
        <div className="rounded-md border border-neutral-200 p-3">
          <div className="text-xs uppercase text-neutral-500">Total TIDs</div>
          <div className="text-lg font-semibold">{totalTids}</div>
        </div>
        <div className="rounded-md border border-neutral-200 p-3">
          <div className="text-xs uppercase text-neutral-500">Avg GMV / TID</div>
          <div className="text-lg font-semibold">
            {avgGmv != null ? `₱${avgGmv.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
          </div>
        </div>
        <div className="rounded-md border border-neutral-200 p-3">
          <div className="text-xs uppercase text-neutral-500">Recovery rate</div>
          <div className="text-lg font-semibold">
            {recoveryRate != null ? `${recoveryRate.toFixed(1)}%` : '—'}
          </div>
        </div>
      </div>

      {sale ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-md border-2 border-neutral-300 bg-neutral-50 p-3">
            <div className="text-xs uppercase text-neutral-500">Sold for</div>
            <div className="text-lg font-semibold">₱{Number(sale.sale_amount).toLocaleString()}</div>
          </div>
          <div className="rounded-md border border-neutral-200 p-3">
            <div className="text-xs uppercase text-neutral-500">Buyer</div>
            <div className="text-lg font-semibold">{sale.buyer_name}</div>
          </div>
          <div className="rounded-md border border-neutral-200 p-3">
            <div className="text-xs uppercase text-neutral-500">Payment</div>
            <div className="text-lg font-semibold">
              {sale.payment_status === 'PAID' ? 'Paid' : 'Pending'}
            </div>
          </div>
        </div>
      ) : (
        profile.role !== 'finance_team' && <RecordBidForm batchId={batch.batch_id} />
      )}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
            <th className="py-2 pr-4">TID</th>
            <th className="py-2 pr-4">Type</th>
            <th className="py-2">GMV</th>
          </tr>
        </thead>
        <tbody>
          {parcels?.map((p) => (
            <tr key={p.tid} className="border-b border-neutral-100">
              <td className="py-2 pr-4 font-mono">
                {p.tid}
                {p.is_synthetic_tid && (
                  <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                    NO-AWB
                  </span>
                )}
              </td>
              <td className="py-2 pr-4">{p.item_type ?? '—'}</td>
              <td className="py-2">
                {p.effective_value != null ? `₱${Number(p.effective_value).toLocaleString()}` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
