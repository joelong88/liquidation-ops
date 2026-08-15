import { getCurrentProfile, type Role } from '@/lib/auth/profile'

// Shared guard for /api/ops/* route handlers — mirrors the role lists the original
// RLS policies enforced per table/operation (see the migration history for the
// authoritative source). Returns the profile on success, or a 401/403 Response to
// return directly from the route on failure.
export async function requireOpsRole(
  roles: Role[]
): Promise<{ ok: true; email: string; role: Role } | { ok: false; response: Response }> {
  const profile = await getCurrentProfile()
  if (!profile) {
    return { ok: false, response: Response.json({ ok: false, error: 'unauthorized' }, { status: 401 }) }
  }
  if (!roles.includes(profile.role)) {
    return { ok: false, response: Response.json({ ok: false, error: 'forbidden' }, { status: 403 }) }
  }
  return { ok: true, email: profile.email, role: profile.role }
}
