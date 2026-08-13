import { RepackForm } from '@/app/ops/repack-ttxb-storage/repack-form'
import { CardHeader } from '@/components/overview-ui'

export default function RepackTtxbStoragePage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <CardHeader title="Repack from TTXB Storage Area" />
        <p className="mt-2 text-sm text-neutral-500">
          Exception-only, TikTok-request-triggered. Pulls one TID out of an open Storage sack
          mid-hold for relabel/redelivery — the rest of the sack keeps waiting normally.
        </p>
      </div>
      <RepackForm />
    </div>
  )
}
