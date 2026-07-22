import { AreaInboundForm } from '@/app/ops/area-inbound-form'

export default function NewArrivalLiquidationPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">
          New Arrival — Liquidation Area
        </h2>
        <p className="text-sm text-neutral-500">
          Non-TTXB parcels get their first-ever sack scan here (TID+sack) — they skip Storage
          entirely.
        </p>
      </div>
      <AreaInboundForm area="LIQUIDATION" />
    </div>
  )
}
