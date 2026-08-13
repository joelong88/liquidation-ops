import { AreaInboundForm } from '@/app/ops/area-inbound-form'
import { CardHeader } from '@/components/overview-ui'

export default function NewArrivalLiquidationPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <CardHeader title="New Arrival — Liquidation Area" />
        <p className="mt-2 text-sm text-neutral-500">
          Non-TTXB parcels get their first-ever sack scan here (TID+sack) — they skip Storage
          entirely.
        </p>
      </div>
      <AreaInboundForm area="LIQUIDATION" />
    </div>
  )
}
