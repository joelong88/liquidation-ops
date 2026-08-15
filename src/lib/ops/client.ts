// Shared client-side caller for /api/ops/* routes — replaces the direct
// supabase.rpc(...)/.from(...) calls these components used to make. Every route
// returns a plain {ok, error?, ...} JSON body (matching the shape the old RPC calls'
// `data` had), whether the outcome is a business-logic failure or an auth failure,
// so callers can keep their existing result-shape handling unchanged.
export async function callOpsApi<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
  try {
    const res = await fetch(`/api/ops/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return (await res.json()) as T
  } catch {
    return { ok: false, error: 'network_error' } as T
  }
}

export async function getOpsApi<T = Record<string, unknown>>(
  path: string,
  params?: Record<string, string>
): Promise<T> {
  try {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : ''
    const res = await fetch(`/api/ops/${path}${qs}`)
    return (await res.json()) as T
  } catch {
    return { ok: false, error: 'network_error' } as T
  }
}
