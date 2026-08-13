import { requireRole, AccessRestricted } from '@/lib/supabase/role-gate'
import { TabNav } from '@/app/ops/tab-nav'
import { BackToDashboard } from '@/components/back-to-dashboard'
import { OverviewCanvas, Card } from '@/components/overview-ui'

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(['warehouse_ops', 'recovery_team', 'owner'])
  if (!profile) return <AccessRestricted />

  return (
    <main className="min-h-screen p-6">
      <OverviewCanvas>
        <div>
          <BackToDashboard />
          <span className="text-xs font-bold uppercase tracking-wide text-red-600">Warehouse floor</span>
          <h1 className="mt-1 text-2xl font-bold text-neutral-900">Operations</h1>
          <p className="text-sm text-neutral-500">
            Signed in as {profile.full_name ?? profile.id} ({profile.role})
          </p>
        </div>
        <Card>
          <TabNav />
        </Card>
        <Card>{children}</Card>
      </OverviewCanvas>
    </main>
  )
}
