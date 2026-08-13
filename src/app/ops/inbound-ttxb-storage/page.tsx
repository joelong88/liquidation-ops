import { AreaInboundForm } from '@/app/ops/area-inbound-form'
import { CardHeader } from '@/components/overview-ui'

export default function InboundTtxbStoragePage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <CardHeader title="Inbound into TTXB Storage Area" />
        <p className="mt-2 text-sm text-neutral-500">
          For TID+sack scans carried here from First Scan (bins A/B). Associates the TID to a
          sack and starts the 7-day hold on the sack&apos;s first parcel.
        </p>
      </div>
      <AreaInboundForm area="STORAGE" />
    </div>
  )
}
