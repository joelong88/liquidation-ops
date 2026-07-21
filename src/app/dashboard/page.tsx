import Link from 'next/link'
import { getCurrentProfile, type Role } from '@/lib/supabase/profile'
import { logout } from '@/app/actions/auth'

// Placeholder landing page for now. Once M6-M7 land, this should route each role
// to its actual home (warehouse_ops -> /ops, recovery_team -> /ops, finance_team ->
// /recovery/batches, owner -> the real dashboard content below).
const NAV_LINKS: { href: string; label: string; roles: Role[] }[] = [
  { href: '/ops', label: 'Operations (10 stations)', roles: ['warehouse_ops', 'recovery_team', 'owner'] },
  {
    href: '/scan/history',
    label: 'Scan history',
    roles: ['warehouse_ops', 'recovery_team', 'owner'],
  },
  {
    href: '/recovery/batches',
    label: 'Batches',
    roles: ['recovery_team', 'finance_team', 'owner'],
  },
]

export default async function DashboardPage() {
  const profile = await getCurrentProfile()
  const links = profile ? NAV_LINKS.filter((l) => l.roles.includes(profile.role)) : []

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
        <>
          <p className="text-sm text-neutral-600">
            Signed in as <span className="font-medium">{profile.full_name ?? profile.id}</span> (
            {profile.role})
          </p>
          <nav className="flex gap-3">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-500"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </>
      )}
    </main>
  )
}
