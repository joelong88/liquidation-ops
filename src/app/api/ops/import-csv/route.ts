import { requireOpsRole } from '@/lib/ops/api-helpers'
import { importParcelRows } from '@/lib/ops/import'

// import_parcel_rows did its own in-body role check rather than relying solely on
// RLS — ported the same way: requireOpsRole here only confirms there's a session at
// all (any of the 4 roles), and importParcelRows enforces the actual restriction
// itself, matching the original's authoritative check.
export async function POST(request: Request) {
  const auth = await requireOpsRole(['warehouse_ops', 'recovery_team', 'finance_team', 'owner'])
  if (!auth.ok) return auth.response

  const body = await request.json()
  const rows = Array.isArray(body.rows) ? body.rows : []
  const result = await importParcelRows(auth.email, auth.role, rows)
  return Response.json(result)
}
