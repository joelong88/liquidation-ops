import { getCurrentProfile } from '@/lib/supabase/profile'
import { logout } from '@/app/actions/auth'

// Placeholder landing page for now. Once M4-M7 land, this should route each role
// to its actual home (warehouse_ops -> /scan, recovery_team -> /recovery/storage,
// finance_team -> /finance/sales, owner -> the real dashboard content below).
export default async function DashboardPage() {
  const profile = await getCurrentProfile()

  return (
    <main className="flex min-h-screen flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">Liquidation Ops</h1>
        <form action={logout}>
          <button type="submit" className="text-sm text-neutral-500 hover:text-neutral-900">
            Sign out
          </button>
        </form>
      </div>

      {!profile ? (
        <p className="text-sm text-amber-700">
          Your account isn&apos;t assigned a role yet. Ask the owner to assign one from
          /admin/users.
        </p>
      ) : (
        <p className="text-sm text-neutral-600">
          Signed in as <span className="font-medium">{profile.full_name ?? profile.id}</span> (
          {profile.role})
        </p>
      )}
    </main>
  )
}
