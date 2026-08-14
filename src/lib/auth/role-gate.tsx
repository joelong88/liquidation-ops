import { getCurrentProfile, type Profile, type Role } from '@/lib/auth/profile'

// Server-only. Defense in depth alongside proxy.ts — per Next.js's own guidance, a
// route's proxy matcher can be bypassed by a Server Function call on the same path,
// so every page/action that needs a specific role checks it here too, not just there.
export async function requireRole(roles: Role[]): Promise<Profile | null> {
  const profile = await getCurrentProfile()
  if (!profile || !roles.includes(profile.role)) return null
  return profile
}

export function AccessRestricted() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <p className="text-sm text-neutral-600">You don&apos;t have access to this page.</p>
    </main>
  )
}
