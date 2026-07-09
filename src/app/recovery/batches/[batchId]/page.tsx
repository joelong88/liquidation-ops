import { notFound } from 'next/navigation'
import { requireRole, AccessRestricted } from '@/lib/supabase/role-gate'
import { createClient } from '@/lib/supabase/server'
import { RecordBidForm } from '@/app/recovery/batches/[batchId]/record-bid-form'

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
    .select('tid, item_type, cod_value, is_synthetic_tid')
    .eq('batch_id', batch.batch_id)
    .order('tid')

  const { data: sale } = await supabase
    .from('sale')
    .select('*')
    .eq('batch_id', batch.batch_id)
    .maybeSingle()

  const recoveryRate =
    sale && batch.ceiling_price ? (sale.sale_amount / Number(batch.ceiling_price)) * 100 : null

  return (
    <main className="flex min-h-screen flex-col gap-6 p-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">
          Batch {batch.batch_number} <span className="text-neutral-400">({batch.status})</span>
        </h1>
        <p className="text-sm text-neutral-500">
          {batch.batch_type} · {parcels?.length ?? 0} parcels
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-md border border-neutral-200 p-3">
          <div className="text-xs uppercase text-neutral-500">Ceiling price</div>
          <div className="text-lg font-semibold">
            {batch.ceiling_price != null ? `₱${Number(batch.ceiling_price).toLocaleString()}` : '—'}
          </div>
        </div>
        <div className="rounded-md border border-neutral-200 p-3">
          <div className="text-xs uppercase text-neutral-500">Floor price</div>
          <div className="text-lg font-semibold">
            {batch.floor_price != null ? `₱${Number(batch.floor_price).toLocaleString()}` : '—'}
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
        <div className="rounded-md border border-neutral-200 p-4 text-sm">
          <div className="font-medium text-neutral-900">Sold to {sale.buyer_name}</div>
          <div className="text-neutral-600">
            ₱{Number(sale.sale_amount).toLocaleString()} ·{' '}
            {sale.payment_status === 'PAID' ? 'Paid' : 'Payment pending'}
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
            <th className="py-2">COD</th>
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
                {p.cod_value != null ? `₱${Number(p.cod_value).toLocaleString()}` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
