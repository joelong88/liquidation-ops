import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/supabase/types'

// For use in Server Components, Server Actions, and Route Handlers only.
// `cookies()` is async in this Next.js version — see node_modules/next/dist/docs/
// 01-app/03-api-reference/04-functions/cookies.md.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component (not a Server Action/Route Handler) —
            // cookies can't be set here. Safe to ignore as long as proxy.ts is
            // refreshing the session on every request (see proxy.ts).
          }
        },
      },
    }
  )
}
