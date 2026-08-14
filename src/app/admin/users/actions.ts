'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/role-gate'
import type { Role } from '@/lib/auth/profile'
import { query } from '@/lib/db/mysql'

const ROLES: Role[] = ['warehouse_ops', 'recovery_team', 'finance_team', 'owner']

function isRole(value: FormDataEntryValue | null): value is Role {
  return typeof value === 'string' && (ROLES as string[]).includes(value)
}

export async function upsertUser(formData: FormData) {
  const profile = await requireRole(['owner'])
  if (!profile) throw new Error('forbidden')

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const role = formData.get('role')
  const fullName = String(formData.get('full_name') ?? '').trim() || null
  if (!email || !isRole(role)) throw new Error('invalid input')

  await query(
    `insert into profile (email, role, full_name, is_active)
     values (?, ?, ?, true)
     on duplicate key update role = values(role), full_name = coalesce(values(full_name), full_name)`,
    [email, role, fullName]
  )

  revalidatePath('/admin/users')
}

export async function setActive(formData: FormData) {
  const profile = await requireRole(['owner'])
  if (!profile) throw new Error('forbidden')

  const email = String(formData.get('email') ?? '')
  const isActive = formData.get('is_active') === 'true'
  if (!email) throw new Error('invalid input')

  // An owner can't lock themselves out this way — deactivating your own only-owner
  // account would leave nobody able to fix it back.
  if (!isActive && email === profile.email) throw new Error("can't deactivate your own account")

  await query('update profile set is_active = ? where email = ?', [isActive, email])
  revalidatePath('/admin/users')
}
