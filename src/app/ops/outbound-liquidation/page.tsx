import { OutboundForm } from '@/app/ops/outbound-liquidation/outbound-form'
import { CardHeader } from '@/components/overview-ui'

export default function OutboundLiquidationPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <CardHeader title="Outbound from Liquidation Area" />
        <p className="mt-2 text-sm text-neutral-500">
          Pallet-level scan, after a bid is won. Requires the pallet to already be marked SOLD.
        </p>
      </div>
      <OutboundForm />
    </div>
  )
}
