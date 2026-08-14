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
    })
  }
  return pool
}

export async function query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
  const [rows] = await getPool().query(sql, params)
  return rows as T[]
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
