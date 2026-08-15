import { requireRole, AccessRestricted } from '@/lib/auth/role-gate'
import { query } from '@/lib/db/mysql'
import { upsertUser, setActive } from '@/app/admin/users/actions'
import { BackToDashboard } from '@/components/back-to-dashboard'
import { OverviewCanvas, Card, CardHeader } from '@/components/overview-ui'

type ProfileRow = {
  email: string
  role: string
  full_name: string | null
  is_active: number | boolean
}

const ROLES = ['warehouse_ops', 'recovery_team', 'finance_team', 'owner'] as const

export default async function AdminUsersPage() {
  const profile = await requireRole(['owner'])
  if (!profile) return <AccessRestricted />

  const users = await query<ProfileRow>('select email, role, full_name, is_active from profile order by email')

  return (
    <main className="min-h-screen p-6">
      <OverviewCanvas>
        <div>
          <BackToDashboard />
          <h1 className="mt-1 text-2xl font-bold text-neutral-900">Users &amp; roles</h1>
          <p className="text-sm text-neutral-500">
            There&apos;s no self-service invite flow — grant access here by email once someone has
            signed in via SSO at least once (or pre-provision it ahead of time).
          </p>
        </div>

        <Card>
          <CardHeader title="Add or update a user" />
          <form action={upsertUser} className="mt-3 flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="email" className="text-sm font-medium text-neutral-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="name@ninjavan.co"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="full_name" className="text-sm font-medium text-neutral-700">
                Full name (optional)
              </label>
              <input
                id="full_name"
                name="full_name"
                type="text"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="role" className="text-sm font-medium text-neutral-700">
                Role
              </label>
              <select
                id="role"
                name="role"
                required
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
            >
              Save
            </button>
          </form>
        </Card>

        <Card>
          <CardHeader title="All users" subtitle={`${users.length} total`} />
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Change role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.email} className="border-b border-neutral-50">
                  <td className="py-2 pr-4 font-mono">{u.email}</td>
                  <td className="py-2 pr-4">{u.full_name ?? '—'}</td>
                  <td className="py-2 pr-4">{u.role}</td>
                  <td className="py-2 pr-4">
                    <form action={setActive} className="inline">
                      <input type="hidden" name="email" value={u.email} />
                      <input type="hidden" name="is_active" value={u.is_active ? 'false' : 'true'} />
                      <button
                        type="submit"
                        disabled={Boolean(u.is_active) && u.email === profile.email}
                        className={`rounded-full px-2 py-0.5 text-xs disabled:opacity-40 ${
                          u.is_active
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-red-100 hover:text-red-800'
                            : 'bg-neutral-200 text-neutral-600 hover:bg-emerald-100 hover:text-emerald-800'
                        }`}
                      >
                        {u.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </form>
                  </td>
                  <td className="py-2">
                    <form action={upsertUser} className="flex items-center gap-2">
                      <input type="hidden" name="email" value={u.email} />
                      <select
                        name="role"
                        defaultValue={u.role}
                        className="rounded-md border border-neutral-300 px-2 py-1 text-xs focus:border-neutral-500 focus:outline-none"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-500"
                      >
                        Update
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && <p className="mt-2 text-sm text-neutral-400">No users yet.</p>}
        </Card>
      </OverviewCanvas>
    </main>
  )
}
