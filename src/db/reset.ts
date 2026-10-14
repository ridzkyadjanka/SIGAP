// Menghapus seluruh tabel & tipe di schema public (dipakai oleh `npm run db:reset`)
import "dotenv/config";
import { Pool } from "pg";
import { pgConfig } from "./connection";

async function main() {
  const pool = new Pool(pgConfig());
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await pool.end();
  console.log("Database dikosongkan.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
