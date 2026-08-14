import { NextResponse, type NextRequest } from 'next/server'

// Named `proxy.ts` (not `middleware.ts`) per this project's Next.js version —
// `middleware` was renamed to `proxy` in Next 16. See node_modules/next/dist/docs/
// 01-app/03-api-reference/03-file-conventions/proxy.md.
//
// Auth is no longer a session cookie this app manages — Substrait's Google-SSO
// reverse proxy sits in front of the whole app and injects X-Forwarded-Email once
// SSO is enabled for it in the portal; unauthenticated requests never reach this code
// at all in that case. This check exists for the case SSO is off, misconfigured, or
// (local dev) there's no gateway in front at all — X-Forwarded-Email is then genuinely
// absent, not spoofable-but-trusted, so "header missing" must mean "not authenticated."
// Per-role authorization (who can see/do what beyond "logged in or not") is enforced
// inside each page/Server Action via requireRole(), not here — Next.js explicitly
// warns a route's proxy matcher can be bypassed by a Server Function call.
//
// /health must always stay public — it's Substrait's container readiness probe, and
// a block instead of 200 would fail the deploy outright. /api/whoami is public so it
// can be used to verify the SSO header mechanics directly.
const PUBLIC_PATHS = ['/health', '/api/whoami']

export function proxy(request: NextRequest) {
  const isPublicPath = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path))
  if (isPublicPath) {
    return NextResponse.next()
  }

  const email =
    request.headers.get('x-forwarded-email') ??
    (process.env.NODE_ENV !== 'production' ? process.env.DEV_FORWARDED_EMAIL : undefined)

  if (!email) {
    return new NextResponse('Sign-in required — this app is only reachable through Google SSO.', {
      status: 403,
    })
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Skip static assets and image optimization; run everywhere else.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
