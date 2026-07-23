import { requireRole, AccessRestricted } from '@/lib/supabase/role-gate'
import { TabNav } from '@/app/ops/tab-nav'
import { BackToDashboard } from '@/components/back-to-dashboard'

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(['warehouse_ops', 'recovery_team', 'owner'])
  if (!profile) return <AccessRestricted />

  return (
    <main className="flex min-h-screen flex-col gap-6 p-6">
      <div>
        <BackToDashboard />
        <h1 className="text-lg font-semibold text-neutral-900">Operations</h1>
        <p className="text-sm text-neutral-500">
          Signed in as {profile.full_name ?? profile.id} ({profile.role})
        </p>
      </div>
      <TabNav />
      <div>{children}</div>
    </main>
  )
}
