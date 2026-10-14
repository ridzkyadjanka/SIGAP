import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { isServerless, pgConfig } from "./connection";

const globalForDb = globalThis as unknown as { pgPool?: Pool };

// Di serverless setiap instance hanya membuka sedikit koneksi; Supabase Transaction pooler (port 6543)
// yang membagi koneksi ke database.
const pool =
  globalForDb.pgPool ??
  new Pool({
    ...pgConfig(),
    max: isServerless ? 3 : 10,
    idleTimeoutMillis: isServerless ? 5_000 : 30_000,
    connectionTimeoutMillis: 15_000,
  });

globalForDb.pgPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
