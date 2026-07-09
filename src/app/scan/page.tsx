import { getCurrentProfile } from '@/lib/supabase/profile'
import { createClient } from '@/lib/supabase/server'
import { ScanForm } from '@/app/scan/scan-form'

export default async function ScanPage() {
  const profile = await getCurrentProfile()

  if (!profile || !['warehouse_ops', 'recovery_team', 'owner'].includes(profile.role)) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-sm text-neutral-600">
          This page is for warehouse ops and recovery team accounts.
        </p>
      </main>
    )
  }

  const supabase = await createClient()
  const { data: categories } = await supabase
    .from('ref_parcel_category')
    .select('code, label')
    .order('code')

  return (
    <main className="flex min-h-screen flex-col gap-6 p-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Scan</h1>
        <p className="text-sm text-neutral-500">Signed in as {profile.full_name ?? profile.id}</p>
      </div>
      <ScanForm categories={categories ?? []} />
    </main>
  )
}
