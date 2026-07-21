import { createClient } from '@/lib/supabase/server'
import { InboundLiquidationModeTabs } from '@/app/ops/inbound-liquidation/mode-tabs'

export default async function InboundLiquidationPage() {
  const supabase = await createClient()
  const [{ data: sacks }, { data: noAwbParcels }] = await Promise.all([
    supabase
      .from('sack')
      .select('sack_id, sack_code, shipper_segment')
      .eq('status', 'STRIPPED')
      .eq('area', 'STORAGE')
      .order('sack_code'),
    supabase
      .from('parcel')
      .select('tid, cod_value')
      .eq('is_synthetic_tid', true)
      .is('sack_id', null)
      .is('pallet_id', null)
      .order('tid'),
  ])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">
          Inbound into Liquidation Area
        </h2>
        <p className="text-sm text-neutral-500">
          Two things happen at this station: non-TTXB parcels get their first-ever scan here
          (TID+sack), and TTXB sacks arriving already-stripped from Storage get consolidated
          onto a pallet (~10 sacks/pallet) — same for NO-AWB parcels, which have no barcode.
        </p>
      </div>
      <InboundLiquidationModeTabs sacks={sacks ?? []} noAwbParcels={noAwbParcels ?? []} />
    </div>
  )
}
