import { RepackForm } from '@/app/ops/repack-ttxb-storage/repack-form'

export default function RepackTtxbStoragePage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">
          Repack from TTXB Storage Area
        </h2>
        <p className="text-sm text-neutral-500">
          Exception-only, TikTok-request-triggered. Pulls one TID out of an open Storage sack
          mid-hold for relabel/redelivery — the rest of the sack keeps waiting normally.
        </p>
      </div>
      <RepackForm />
    </div>
  )
}
