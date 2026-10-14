// Membuat database (jika belum ada) sesuai DATABASE_URL di file .env
import "dotenv/config";
import { Client } from "pg";
import { pgConfig } from "./connection";

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  const dbName = url.pathname.replace(/^\//, "");
  url.pathname = "/postgres";
  const client = new Client(pgConfig(url.toString()));
  try {
    await client.connect();
  } catch (e) {
    console.error("\n✗ Tidak dapat terhubung ke PostgreSQL. Periksa DATABASE_URL di file .env (user/password/port) dan pastikan PostgreSQL berjalan.\n");
    throw e;
  }
  const r = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (r.rowCount === 0) {
    await client.query(`CREATE DATABASE "${dbName.replace(/"/g, "")}"`);
    console.log(`✓ Database "${dbName}" dibuat.`);
  } else {
    console.log(`✓ Database "${dbName}" sudah ada.`);
  }
  await client.end();
}
main().catch(() => process.exit(1));
