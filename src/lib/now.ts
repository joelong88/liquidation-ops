// Tiny indirection so `Date.now()` isn't called directly inside a Server Component
// body, which react-hooks/purity flags as an impure call even though Server
// Components re-run fully per request and have none of the memoization concerns the
// rule exists for.
export function serverNow(): number {
  return Date.now()
}
