import { createClient } from '@/lib/supabase/server'
import { EndorsePalletsForm } from '@/app/ops/endorsement/endorse-pallets-form'
import { CardHeader } from '@/components/overview-ui'

export default async function EndorsementPage() {
  const supabase = await createClient()
  const { data: pallets } = await supabase
    .from('pallet')
    .select('pallet_id, pallet_code')
    .in('status', ['ASSEMBLING', 'CLOSED'])
    .order('assembled_at')

  const palletIds = (pallets ?? []).map((p) => p.pallet_id)

  const [{ data: closedEvents }, { data: sacks }, { data: parcels }] = await Promise.all([
    palletIds.length
      ? supabase
          .from('pallet_event')
          .select('pallet_id, event_ts')
          .eq('action', 'CLOSED')
          .in('pallet_id', palletIds)
      : Promise.resolve({ data: [] }),
    palletIds.length
      ? supabase.from('sack').select('pallet_id').in('pallet_id', palletIds)
      : Promise.resolve({ data: [] }),
    palletIds.length
      ? supabase.from('parcel').select('pallet_id, effective_value').in('pallet_id', palletIds)
      : Promise.resolve({ data: [] }),
  ])

  const closedAtByPallet = new Map((closedEvents ?? []).map((e) => [e.pallet_id, e.event_ts]))
  const sackCountByPallet = new Map<number, number>()
  for (const s of sacks ?? []) {
    if (s.pallet_id == null) continue
    sackCountByPallet.set(s.pallet_id, (sackCountByPallet.get(s.pallet_id) ?? 0) + 1)
  }
  const tidCountByPallet = new Map<number, number>()
  const gmvByPallet = new Map<number, number>()
  for (const p of parcels ?? []) {
    if (p.pallet_id == null) continue
    tidCountByPallet.set(p.pallet_id, (tidCountByPallet.get(p.pallet_id) ?? 0) + 1)
    gmvByPallet.set(p.pallet_id, (gmvByPallet.get(p.pallet_id) ?? 0) + (Number(p.effective_value) || 0))
  }

  const enrichedPallets = (pallets ?? []).map((p) => ({
    pallet_id: p.pallet_id,
    pallet_code: p.pallet_code,
    closed_at: closedAtByPallet.get(p.pallet_id) ?? null,
    sack_count: sackCountByPallet.get(p.pallet_id) ?? 0,
    tid_count: tidCountByPallet.get(p.pallet_id) ?? 0,
    gmv: gmvByPallet.get(p.pallet_id) ?? 0,
  }))

  return (
    <div className="flex flex-col gap-4">
      <div>
        <CardHeader title="Endorsement" />
        <p className="mt-2 text-sm text-neutral-500">
          Weekly bulk digital hand-off of assembled pallets to the admin team. Not a scan.
        </p>
      </div>
      <EndorsePalletsForm pallets={enrichedPallets} />
    </div>
  )
}
