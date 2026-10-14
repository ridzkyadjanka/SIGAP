import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Untuk database cloud (Supabase), gunakan alamat SESSION pooler (port 5432) saat menjalankan
// `npm run setup` / `npm run db:push` dari laptop.
const url = new URL(process.env.DATABASE_URL!);
const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    ssl: local ? false : { rejectUnauthorized: false },
  },
});
