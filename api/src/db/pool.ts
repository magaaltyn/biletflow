import pg from "pg";
import { config } from "../lib/config.js";

// Return bigint ids and counts as JS numbers (safe for this project's sizes).
pg.types.setTypeParser(20, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.PG_POOL_MAX ?? 10),
  ssl: /sslmode=require|neon\.tech|supabase/.test(config.databaseUrl) ? { rejectUnauthorized: false } : undefined,
});

export type Db = pg.Pool | pg.PoolClient;

export async function q<T extends pg.QueryResultRow = any>(sql: string, params: unknown[] = [], db: Db = pool) {
  const res = await db.query<T>(sql, params);
  return res.rows;
}

export async function one<T extends pg.QueryResultRow = any>(sql: string, params: unknown[] = [], db: Db = pool) {
  const rows = await q<T>(sql, params, db);
  return rows[0] as T | undefined;
}

/** Runs fn inside a transaction; rolls back on any error. */
export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
