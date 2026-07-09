import { requireRole, AccessRestricted } from '@/lib/supabase/role-gate'
import { createClient } from '@/lib/supabase/server'
import { NoAwbForm } from '@/app/recovery/endorsement/no-awb/no-awb-form'

export default async function NoAwbPage() {
  const profile = await requireRole(['recovery_team', 'owner'])
  if (!profile) return <AccessRestricted />

  const supabase = await createClient()
  const { data: openBatches } = await supabase
    .from('batch')
    .select('batch_id, batch_number, batch_type')
    .eq('status', 'OPEN')
    .order('batch_number', { ascending: false })

  return (
    <main className="flex min-h-screen flex-col gap-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">NO-AWB entry</h1>
        <p className="text-sm text-neutral-500">
          For parcels with no tracking ID — only a COD value and a batch.
        </p>
      </div>
      <NoAwbForm openBatches={openBatches ?? []} />
    </main>
  )
}
