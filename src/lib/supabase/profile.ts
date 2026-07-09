import { createClient } from '@/lib/supabase/server'

export type Role = 'warehouse_ops' | 'recovery_team' | 'finance_team' | 'owner'

export type Profile = {
  id: string
  role: Role
  full_name: string | null
  is_active: boolean
}

// Server-only: reads the logged-in user's role from `profile` (RLS-scoped to their
// own row, see the profile_select_self_or_owner policy). Returns null if there's no
// session or no profile row yet (e.g. a new auth.users row not yet assigned a role
// via /admin/users).
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data, error } = await supabase.from('profile').select('*').eq('id', user.id).single()

  if (error || !data) return null

  return data as Profile
}
