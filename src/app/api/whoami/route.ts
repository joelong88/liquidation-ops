import { NextRequest } from "next/server";

// Phase A probe: confirms Substrait's Google-SSO reverse proxy actually injects
// X-Forwarded-Email once SSO is enabled on the app, before anything downstream
// (the real auth swap in Phase C) depends on it.
export async function GET(request: NextRequest) {
  const email = request.headers.get("x-forwarded-email");
  const user = request.headers.get("x-forwarded-user");
  return Response.json({ email, user });
}
