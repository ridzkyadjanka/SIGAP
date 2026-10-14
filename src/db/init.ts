// Inisialisasi database PRODUKSI tanpa data demo: pengaturan, jam shift, tampilan website, dan 1 akun Super Admin.
// Jalankan: npm run db:init   (opsional: INIT_ADMIN_NO=... INIT_ADMIN_PASSWORD=... npm run db:init)
import "dotenv/config";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { pgConfig } from "./connection";
import * as s from "./schema";
import { DEFAULTS } from "../lib/settings";
import { DEFAULT_SHIFTS } from "../lib/shifts";

const pool = new Pool(pgConfig());
const db = drizzle(pool, { schema: s });

async function main() {
  const existing = await db.select({ id: s.users.id }).from(s.users).limit(1);
  if (existing.length) {
    console.log("Database sudah berisi akun. Inisialisasi dibatalkan.");
    return;
  }
  for (const [key, value] of Object.entries(DEFAULTS)) {
    await db.insert(s.settings).values({ key, value }).onConflictDoNothing();
  }
  await db.insert(s.siteContentVersions).values({ content: DEFAULTS.landing, publishedBy: "Sistem" });
  await db
    .insert(s.shiftConfigs)
    .values(DEFAULT_SHIFTS.map(({ code, name, startTime, endTime, breakStart, breakEnd }) => ({ code, name, startTime, endTime, breakStart, breakEnd })))
    .onConflictDoNothing();
  const no = (process.env.INIT_ADMIN_NO || "SA0001").toUpperCase();
  const pw = process.env.INIT_ADMIN_PASSWORD || "Admin@12345";
  await db.insert(s.users).values({ employeeNo: no, displayName: "Super Administrator", role: "SUPER_ADMIN", passwordHash: await bcrypt.hash(pw, 12), mustChangePassword: true });
  console.log(`✓ Database siap. Login Super Admin: ${no} / ${pw} (wajib ganti password saat login pertama).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
