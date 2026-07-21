import { OutboundForm } from '@/app/ops/outbound-liquidation/outbound-form'

export default function OutboundLiquidationPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">
          Outbound from Liquidation Area
        </h2>
        <p className="text-sm text-neutral-500">
          Pallet-level scan, after a bid is won. Requires the pallet to already be marked SOLD.
        </p>
      </div>
      <OutboundForm />
    </div>
  )
}
