import { headers } from 'next/headers'
import { query } from '@/lib/db/mysql'

export type Role = 'warehouse_ops' | 'recovery_team' | 'finance_team' | 'owner'

export type Profile = {
  email: string
  role: Role
  full_name: string | null
  is_active: boolean
}

// Substrait's Google-SSO reverse proxy injects X-Forwarded-Email once SSO is enabled
// for the app — no OAuth flow in the app itself, and the browser never sees this
// header directly. It's absent (not spoofable-but-trusted, genuinely absent) in local
// dev and on any SSO-exempt path, so local dev falls back to DEV_FORWARDED_EMAIL —
// gated to non-production so this can never accidentally apply to a real deploy.
export async function getCurrentEmail(): Promise<string | null> {
  const h = await headers()
  const email = h.get('x-forwarded-email')
  if (email) return email
  if (process.env.NODE_ENV !== 'production') return process.env.DEV_FORWARDED_EMAIL ?? null
  return null
}

// Server-only: looks up the signed-in user's role from `profile`, keyed by the SSO-
// forwarded email rather than a Supabase auth.users id (there's no equivalent here).
// Returns null if there's no forwarded identity, or no profile row yet — a new email
// hitting the app for the first time has no role until an owner assigns one via
// /admin/users.
export async function getCurrentProfile(): Promise<Profile | null> {
  const email = await getCurrentEmail()
  if (!email) return null

  const rows = await query<Profile>('select * from profile where email = ? and is_active = true', [email])
  return rows[0] ?? null
}
