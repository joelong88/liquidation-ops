// Substrait's container readiness probe. Deliberately has zero imports that touch
// the DB client — a DB-init failure must never take this endpoint down with it.
export async function GET() {
  return new Response("ok", { status: 200 });
}
