import { AreaInboundForm } from '@/app/ops/area-inbound-form'

export default function InboundTtxbStoragePage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">
          Inbound into TTXB Storage Area
        </h2>
        <p className="text-sm text-neutral-500">
          For TID+sack scans carried here from First Scan (bins A/B). Associates the TID to a
          sack and starts the 7-day hold on the sack's first parcel.
        </p>
      </div>
      <AreaInboundForm area="STORAGE" />
    </div>
  )
}
