import Link from 'next/link'
import { requireRole, AccessRestricted } from '@/lib/auth/role-gate'
import { query } from '@/lib/db/mysql'
import { SellPalletsForm } from '@/app/recovery/batches/sell-pallets-form'
import { PalletManifestRow } from '@/app/recovery/batches/pallet-manifest-row'
import { BackToDashboard } from '@/components/back-to-dashboard'
import { OverviewCanvas, Card, CardHeader } from '@/components/overview-ui'

type BatchRow = {
  batch_id: number
  batch_number: number
  batch_type: string
  status: string
  ceiling_price: number | null
  floor_price: number | null
  month: string | null
  parcel_count: number
}

type PalletRow = {
  pallet_id: number
  pallet_code: string
  status: string
  batch_id: number | null
  assembled_at: string | null
  endorsed_at: string | null
  outgoing_at: string | null
}

export default async function BatchesPage() {
  const profile = await requireRole(['recovery_team', 'finance_team', 'owner'])
  if (!profile) return <AccessRestricted />

  const [batches, endorsedPallets, allPallets, palletParcels, batchParcels, sales] = await Promise.all([
    query<BatchRow>(
      `select b.batch_id, b.batch_number, b.batch_type, b.status, b.ceiling_price, b.floor_price, b.month,
              (select count(*) from parcel p where p.batch_id = b.batch_id) as parcel_count
         from batch b
        order by b.batch_number desc`
    ),
    query<{ pallet_id: number; pallet_code: string }>(
      "select pallet_id, pallet_code from pallet where status = 'ENDORSED' and batch_id is null order by endorsed_at asc"
    ),
    query<PalletRow>(
      'select pallet_id, pallet_code, status, batch_id, assembled_at, endorsed_at, outgoing_at from pallet order by assembled_at desc'
    ),
    query<{ pallet_id: number | null; tid: string; effective_value: number | null; manual_value_item_description: string | null }>(
      'select pallet_id, tid, effective_value, manual_value_item_description from parcel where pallet_id is not null'
    ),
    query<{ batch_id: number | null; effective_value: number | null }>(
      'select batch_id, effective_value from parcel where batch_id is not null'
    ),
    query<{ batch_id: number | null; sale_amount: number; payment_status: string }>(
      'select batch_id, sale_amount, payment_status from sale where batch_id is not null'
    ),
  ])

  const tidCountByPallet = new Map<number, number>()
  const gmvByPallet = new Map<number, number>()
  const manifestByPallet = new Map<number, { tid: string; description: string | null; gmv: number }[]>()
  for (const p of palletParcels) {
    if (p.pallet_id == null) continue
    tidCountByPallet.set(p.pallet_id, (tidCountByPallet.get(p.pallet_id) ?? 0) + 1)
    gmvByPallet.set(p.pallet_id, (gmvByPallet.get(p.pallet_id) ?? 0) + (Number(p.effective_value) || 0))
    const items = manifestByPallet.get(p.pallet_id) ?? []
    items.push({
      tid: p.tid,
      description: p.manual_value_item_description,
      gmv: Number(p.effective_value) || 0,
    })
    manifestByPallet.set(p.pallet_id, items)
  }

  const gmvByBatch = new Map<number, number>()
  for (const p of batchParcels) {
    if (p.batch_id == null) continue
    gmvByBatch.set(p.batch_id, (gmvByBatch.get(p.batch_id) ?? 0) + (Number(p.effective_value) || 0))
  }

  const saleByBatch = new Map<number, { sale_amount: number; payment_status: string }>()
  for (const s of sales) {
    if (s.batch_id == null) continue
    saleByBatch.set(s.batch_id, { sale_amount: Number(s.sale_amount), payment_status: s.payment_status })
  }

  const batchNumberById = new Map<number, number>()
  for (const b of batches) {
    batchNumberById.set(b.batch_id, b.batch_number)
  }

  // A batch bundles multiple pallets into one sale — surface which pallet codes
  // belong to each batch right in this top-level list, not just on drill-in.
  const palletCodesByBatch = new Map<number, string[]>()
  for (const p of allPallets) {
    if (p.batch_id == null) continue
    const codes = palletCodesByBatch.get(p.batch_id) ?? []
    codes.push(p.pallet_code)
    palletCodesByBatch.set(p.batch_id, codes)
  }

  const palletRows = allPallets
    .map((p) => {
      const sale = p.batch_id != null ? saleByBatch.get(p.batch_id) : undefined
      const batchGmv = p.batch_id != null ? gmvByBatch.get(p.batch_id) : undefined
      const recoveryRate = sale && batchGmv ? (sale.sale_amount / batchGmv) * 100 : null
      return {
        pallet_id: p.pallet_id,
        pallet_code: p.pallet_code,
        status: p.status,
        batch_id: p.batch_id,
        batch_number: p.batch_id != null ? batchNumberById.get(p.batch_id) : null,
        tidCount: tidCountByPallet.get(p.pallet_id) ?? 0,
        gmv: gmvByPallet.get(p.pallet_id) ?? 0,
        endorsed: p.endorsed_at != null,
        sale,
        recoveryRate,
        outbound: p.outgoing_at != null,
      }
    })
    // Group pallets sharing a batch/sale next to each other, so it's visually obvious
    // e.g. Batch 1 covers pallets A, B, and C — rather than that link only being
    // discoverable by cross-referencing the Batch column one row at a time.
    .sort((a, b) => {
      const an = a.batch_number ?? Infinity
      const bn = b.batch_number ?? Infinity
      if (an !== bn) return an - bn
      return a.pallet_code.localeCompare(b.pallet_code)
    })

  return (
    <main className="min-h-screen p-6">
      <OverviewCanvas>
        <div>
          <BackToDashboard />
          <h1 className="mt-1 text-2xl font-bold text-neutral-900">Pallets for Sale</h1>
        </div>

        {profile.role !== 'finance_team' && (endorsedPallets?.length ?? 0) > 0 && (
          <Card>
            <SellPalletsForm pallets={endorsedPallets ?? []} />
          </Card>
        )}

        <Card>
          <CardHeader title="Batches" subtitle={`${batches?.length ?? 0} total`} />
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-2 pr-4">Batch</th>
                <th className="py-2 pr-4">Pallets</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Parcels</th>
                <th className="py-2 pr-4">Ceiling</th>
                <th className="py-2">Floor</th>
              </tr>
            </thead>
            <tbody>
              {batches?.map((b) => (
                <tr key={b.batch_id} className="border-b border-neutral-50">
                  <td className="py-2 pr-4">
                    <Link
                      href={`/recovery/batches/${b.batch_id}`}
                      className="font-medium text-neutral-900 underline"
                    >
                      Batch {b.batch_number}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {(palletCodesByBatch.get(b.batch_id) ?? []).join(', ') || '—'}
                  </td>
                  <td className="py-2 pr-4">{b.batch_type}</td>
                  <td className="py-2 pr-4">{b.status}</td>
                  <td className="py-2 pr-4">{b.parcel_count ?? 0}</td>
                  <td className="py-2 pr-4">
                    {b.ceiling_price != null ? `₱${Number(b.ceiling_price).toLocaleString()}` : '—'}
                  </td>
                  <td className="py-2">
                    {b.floor_price != null ? `₱${Number(b.floor_price).toLocaleString()}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {batches?.length === 0 && <p className="mt-2 text-sm text-neutral-400">No batches yet.</p>}
        </Card>

        <Card>
          <CardHeader title="Pallets" subtitle="TID count/GMV are per pallet; recovery % is the batch-wide rate" />
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-2 pr-4">Pallet</th>
                <th className="py-2 pr-4">Batch</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">TIDs</th>
                <th className="py-2 pr-4">GMV</th>
                <th className="py-2 pr-4">Endorsed</th>
                <th className="py-2 pr-4">Sold for</th>
                <th className="py-2 pr-4">Recovery %</th>
                <th className="py-2">Outbound</th>
              </tr>
            </thead>
            <tbody>
              {palletRows.map((p) => (
                <tr key={p.pallet_id} className="border-b border-neutral-50">
                  <td className="py-2 pr-4 font-mono">{p.pallet_code}</td>
                  <td className="py-2 pr-4">
                    {p.batch_id != null ? (
                      <Link href={`/recovery/batches/${p.batch_id}`} className="font-medium text-neutral-900 underline">
                        Batch {p.batch_number}
                      </Link>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">{p.status}</td>
                  <td className="py-2 pr-4">{p.tidCount}</td>
                  <td className="py-2 pr-4">₱{p.gmv.toLocaleString()}</td>
                  <td className="py-2 pr-4">{p.endorsed ? 'Yes' : 'No'}</td>
                  <td className="py-2 pr-4">
                    {p.sale ? `₱${p.sale.sale_amount.toLocaleString()}` : '—'}
                  </td>
                  <td className="py-2 pr-4">
                    {p.recoveryRate != null ? `${p.recoveryRate.toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-2">{p.outbound ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {palletRows.length === 0 && <p className="mt-2 text-sm text-neutral-400">No pallets yet.</p>}
        </Card>

        <Card>
          <CardHeader
            title="Pallet History"
            subtitle="per-pallet manifest — view or download to attach when sharing with bidders"
          />
          <div className="mt-3 flex flex-col gap-2">
            {palletRows.map((p) => (
              <PalletManifestRow
                key={p.pallet_id}
                palletCode={p.pallet_code}
                status={p.status}
                gmv={p.gmv}
                items={manifestByPallet.get(p.pallet_id) ?? []}
              />
            ))}
            {palletRows.length === 0 && <p className="text-sm text-neutral-400">No pallets yet.</p>}
          </div>
        </Card>
      </OverviewCanvas>
    </main>
  )
}
