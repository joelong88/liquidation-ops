import mysql from 'mysql2/promise'

// Lazily initialized on first real query, never at module load — so importing this
// file (even transitively, e.g. via a page that also renders something unrelated)
// can never take down routes that don't actually need the database, like /health.
let pool: mysql.Pool | null = null

function getPool(): mysql.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    pool = mysql.createPool({
      uri: url,
      decimalNumbers: true,
      dateStrings: false,
      connectionLimit: 10,
      // mysql2's `timezone` option only controls how the driver parses/serializes
      // JS Date <-> SQL string on THIS side of the wire — it does nothing to the
      // DB SERVER's own session timezone, which is what current_timestamp(6)
      // (the default for every event_ts/created_at column) actually computes
      // against. The server's session is Manila (UTC+8, confirmed empirically:
      // a scan at 3:54 PM Manila time was stored and displayed as 11:49 PM — the
      // Manila value stored untagged, then format-date.ts's Manila conversion
      // applied a SECOND +8h on top). Setting it here as a client option alone
      // (previous attempt) did not fix this. The actual fix has to change what
      // the server computes, via a real SET time_zone on every connection below.
      timezone: 'Z',
    })
    // Force every physical connection's session to UTC so current_timestamp(6)
    // stores a true UTC instant, matching what format-date.ts's Manila conversion
    // expects to convert FROM.
    //
    // The pool's 'connection' event hands back the RAW underlying connection, not
    // the promise-wrapped one, despite mysql2/promise's types declaring it as the
    // latter — calling .catch() on conn.query() here throws "not a promise" on
    // every single new connection (confirmed live: this crashed the server
    // outright). Must use the raw connection's callback-style query() instead; the
    // cast works around the incorrect type declaration, not around a real mismatch.
    pool.on('connection', (conn) => {
      const raw = conn as unknown as { query: (sql: string, cb: (err: unknown) => void) => void }
      raw.query("SET time_zone = '+00:00'", (err) => {
        if (err) console.error('Failed to set session time_zone on new connection', err)
      })
    })
  }
  return pool
}

export async function query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
  const [rows] = await getPool().query(sql, params)
  return rows as T[]
}

// Same as query(), but against a connection already held for a transaction (see
// withTransaction below) rather than pulling a fresh one from the pool. mysql2's
// TypeScript types require SELECT results to satisfy `RowDataPacket` when a type
// argument is passed to .query() directly — going through `unknown` here avoids
// every call site needing `& RowDataPacket` on its own row-shape type.
export async function queryRows<T = unknown>(
  conn: mysql.PoolConnection,
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const [rows] = await conn.query(sql, params)
  return rows as T[]
}

// Same idea for INSERT/UPDATE/DELETE against a held connection — returns mysql2's
// result header (affectedRows, insertId, etc.) without the RowDataPacket generic
// friction.
export async function execute(
  conn: mysql.PoolConnection,
  sql: string,
  params?: unknown[]
): Promise<mysql.ResultSetHeader> {
  const [result] = await conn.query(sql, params)
  return result as mysql.ResultSetHeader
}

// For multi-statement operations that must run on one held connection (e.g. a
// SELECT ... FOR UPDATE followed by a write) — a connection pulled from a pool and
// used across separate .query() calls can silently be a *different* connection each
// time, which would make FOR UPDATE lock nothing. Always route anything needing
// that guarantee through this, not through repeated top-level query() calls.
export async function withTransaction<T>(
  fn: (conn: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const conn = await getPool().getConnection()
  try {
    await conn.beginTransaction()
    const result = await fn(conn)
    await conn.commit()
    return result
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}
