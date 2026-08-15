// MySQL error 1062 (ER_DUP_ENTRY) is the equivalent of Postgres's
// `exception when unique_violation` — every ported RPC that used that as control
// flow (turning a constraint violation into a friendly {ok:false,error:'already_x'}
// response) checks this instead, inside the same transaction, before the caller
// commits — see src/lib/db/mysql.ts's withTransaction() doc comment for why this
// must never be a bare try/catch spanning a pooled connection.
export function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { errno?: number }).errno === 1062
}
