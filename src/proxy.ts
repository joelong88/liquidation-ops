import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Named `proxy.ts` (not `middleware.ts`) per this project's Next.js version —
// `middleware` was renamed to `proxy` in Next 16. See node_modules/next/dist/docs/
// 01-app/03-api-reference/03-file-conventions/proxy.md.
//
// This only refreshes the Supabase session cookie and gates unauthenticated access
// to /login. Per-role authorization (who can see/do what beyond "logged in or not")
// is enforced by RLS policies and inside each Server Action/page, not here — Next.js
// explicitly warns that Server Function calls can bypass a route's proxy matcher, so
// proxy alone must never be the only authorization check.
const PUBLIC_PATHS = ['/login']

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isPublicPath = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path))

  if (!user && !isPublicPath) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    // Skip static assets, image optimization, and the platform's /health probe
    // (it must not redirect to /login, nor hit Supabase on every check);
    // run everywhere else.
    '/((?!_next/static|_next/image|favicon.ico|health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
