// Data awal (demo) SIGAP. Jalankan: npm run db:seed  (atau npm run db:reset untuk mengulang dari nol)
import "dotenv/config";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { pgConfig } from "./connection";
import * as s from "./schema";
import { addDays, todayStr, birthDatePassword } from "../lib/dates";
import { DEFAULTS } from "../lib/settings";
import { DEFAULT_SHIFTS } from "../lib/shifts";

const pool = new Pool(pgConfig());
const db = drizzle(pool, { schema: s });

// Generator acak deterministik agar data demo konsisten
let seed = 20261014;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const randomBirth = () => `${1975 + Math.floor(rnd() * 25)}-${pad(1 + Math.floor(rnd() * 12))}-${pad(1 + Math.floor(rnd() * 28))}`;

const FIRST = [
  "Agus", "Andi", "Arif", "Bambang", "Dedi", "Dimas", "Eko", "Fajar", "Fikri", "Hendra", "Heri", "Indra",
  "Irfan", "Joko", "Kurniawan", "Lukman", "Mulyadi", "Nanda", "Rahmat", "Rizal", "Rudi", "Sandi", "Slamet",
  "Taufik", "Teguh", "Wahyu", "Yudi", "Zainal", "Ilham", "Reza", "Bayu", "Galih", "Hadi", "Yoga", "Rendi",
];
const LAST = [
  "Saputra", "Pratama", "Wijaya", "Hidayat", "Setiawan", "Kurnia", "Santoso", "Firmansyah", "Ramadhan",
  "Prasetyo", "Gunawan", "Nugroho", "Siregar", "Harahap", "Lubis", "Syahputra", "Susanto", "Maulana",
];

async function main() {
  const existing = await db.select({ id: s.users.id }).from(s.users).limit(1);
  if (existing.length) {
    console.log("Database sudah berisi data. Gunakan `npm run db:reset` untuk mengulang data demo.");
    return;
  }
  const today = todayStr();
  console.log(`Membuat data demo SIGAP (hari ini: ${today}) …`);

  // ── Pengaturan & shift ──
  for (const [key, value] of Object.entries(DEFAULTS)) {
    await db.insert(s.settings).values({ key, value });
  }
  await db.insert(s.siteContentVersions).values({ content: DEFAULTS.landing, publishedBy: "Sistem" });
  await db.insert(s.shiftConfigs).values(DEFAULT_SHIFTS.map(({ code, name, startTime, endTime, breakStart, breakEnd }) => ({ code, name, startTime, endTime, breakStart, breakEnd })));

  // ── PIT ──
  const pitRows = await db
    .insert(s.pits)
    .values([
      { code: "PIT-A", name: "PIT A — Banko Barat", loadingPoint: "LP Banko A1", dumpingPoint: "Disposal Utara", description: "Area penambangan utama batubara" },
      { code: "PIT-B", name: "PIT B — Muara Tiga Besar", loadingPoint: "LP MTB 2", dumpingPoint: "Disposal Timur", description: "Area overburden removal" },
      { code: "PIT-C", name: "PIT C — Air Laya", loadingPoint: "LP Air Laya 1", dumpingPoint: "Stockpile ROM", description: "Area hauling & stockpile" },
    ])
    .returning();
  const [pitA, pitB, pitC] = pitRows;

  // ── Fleet ──
  const fleetRows = await db
    .insert(s.fleets)
    .values([
      { code: "FL-01", name: "Fleet 01", pitId: pitA.id, loadingPoint: "LP Banko A1" },
      { code: "FL-02", name: "Fleet 02", pitId: pitA.id, loadingPoint: "LP Banko A2" },
      { code: "FL-03", name: "Fleet 03", pitId: pitB.id, loadingPoint: "LP MTB 2" },
      { code: "FL-04", name: "Fleet 04", pitId: pitB.id, loadingPoint: "LP MTB 3" },
      { code: "FL-05", name: "Fleet 05", pitId: pitC.id, loadingPoint: "LP Air Laya 1" },
    ])
    .returning();
  const fl = Object.fromEntries(fleetRows.map((f) => [f.code, f]));

  // ── Unit ──
  type U = { code: string; category: string; model: string; fleet?: string; pit: typeof pitA; status: "OPERASI" | "STANDBY" | "BREAKDOWN" };
  const unitDefs: U[] = [
    { code: "EX-2001", category: "EXCAVATOR", model: "Komatsu PC2000", fleet: "FL-01", pit: pitA, status: "OPERASI" },
    { code: "EX-1251", category: "EXCAVATOR", model: "Komatsu PC1250", fleet: "FL-02", pit: pitA, status: "OPERASI" },
    { code: "EX-0501", category: "EXCAVATOR", model: "Komatsu PC500", fleet: "FL-03", pit: pitB, status: "OPERASI" },
    { code: "EX-0401", category: "EXCAVATOR", model: "Komatsu PC400", fleet: "FL-04", pit: pitB, status: "OPERASI" },
    { code: "EX-0211", category: "EXCAVATOR", model: "Komatsu PC210", fleet: "FL-05", pit: pitC, status: "STANDBY" },
    { code: "DZ-1551", category: "DOZER", model: "Komatsu D155", pit: pitA, status: "OPERASI" },
    { code: "DZ-0851", category: "DOZER", model: "Komatsu D85", pit: pitB, status: "OPERASI" },
    { code: "GR-8251", category: "GRADER", model: "Komatsu GD825", pit: pitA, status: "OPERASI" },
    { code: "GR-7051", category: "GRADER", model: "Komatsu GD705", pit: pitC, status: "STANDBY" },
    { code: "WL-0101", category: "WHEEL_LOADER", model: "Wheel Loader", pit: pitC, status: "OPERASI" },
    { code: "CP-0101", category: "COMPACTOR", model: "Compactor", pit: pitC, status: "STANDBY" },
    { code: "WT-0101", category: "WATER_TRUCK", model: "Water Truck", pit: pitA, status: "OPERASI" },
    { code: "WT-0102", category: "WATER_TRUCK", model: "Water Truck", pit: pitB, status: "BREAKDOWN" },
    { code: "SRT-101", category: "SRT", model: "Sany SRT100S", fleet: "FL-03", pit: pitB, status: "OPERASI" },
    { code: "SRT-102", category: "SRT", model: "Sany SRT100S", fleet: "FL-03", pit: pitB, status: "OPERASI" },
    { code: "SRT-103", category: "SRT", model: "Sany SRT100S", fleet: "FL-04", pit: pitB, status: "STANDBY" },
  ];
  const dtFleets = ["FL-01", "FL-01", "FL-01", "FL-02", "FL-02", "FL-02", "FL-04", "FL-04", "FL-05", "FL-05", "FL-05", "FL-01"];
  for (let i = 0; i < 12; i++) {
    const f = dtFleets[i];
    unitDefs.push({
      code: `DT-${pad(41 + i, 3)}`,
      category: "DUMP_TRUCK",
      model: "Mercedes-Benz Arocs 4845",
      fleet: f,
      pit: pitRows.find((p) => p.id === fl[f].pitId)!,
      status: i === 11 ? "BREAKDOWN" : "OPERASI",
    });
  }
  for (let i = 0; i < 4; i++) {
    unitDefs.push({ code: `DT-${101 + i}`, category: "DUMP_TRUCK", model: "Mercedes-Benz Axor 2528", fleet: "FL-05", pit: pitC, status: i < 3 ? "OPERASI" : "STANDBY" });
  }
  const unitRows = await db
    .insert(s.units)
    .values(unitDefs.map((u) => ({ code: u.code, category: u.category, model: u.model, fleetId: u.fleet ? fl[u.fleet].id : null, pitId: u.pit.id, status: u.status })))
    .returning();

  // ── Personel ──
  // Grup A: hari ini = hari ke-3 (Pagi). Grup B: hari ini = hari ke-10 (Malam).
  // Kelipatan 14 hari (k) membuat estimasi cuti tersebar untuk demo Early Warning.
  const skillPlan: string[][] = [
    ...Array(15).fill(["DUMP_TRUCK"]),
    ["DUMP_TRUCK", "SRT"], ["DUMP_TRUCK", "SRT"], ["SRT"],
    ["EXCAVATOR"], ["EXCAVATOR"], ["EXCAVATOR", "DOZER"], ["EXCAVATOR"],
    ["DOZER"], ["DOZER", "GRADER"], ["GRADER"],
    ["WHEEL_LOADER", "COMPACTOR"], ["WATER_TRUCK", "DUMP_TRUCK"], ["WATER_TRUCK"],
  ];
  const usedNames = new Set<string>(["Ahmad Nugraha", "Budi Santoso"]);
  const nextName = () => {
    for (;;) {
      const n = `${pick(FIRST)} ${pick(LAST)}`;
      if (!usedNames.has(n)) {
        usedNames.add(n);
        return n;
      }
    }
  };

  type P = typeof s.personnel.$inferInsert;
  const people: P[] = [];
  let opNo = 1001;
  for (const group of ["A", "B"] as const) {
    skillPlan.forEach((skills, i) => {
      const k = 1 + ((i * 7 + (group === "A" ? 0 : 2)) % 4);
      const offset = group === "A" ? 2 : 9;
      const name = group === "A" && i === 0 ? "Ahmad Nugraha" : nextName();
      people.push({
        employeeNo: `OP${opNo++}`,
        name,
        birthDate: name === "Ahmad Nugraha" ? "1990-05-15" : randomBirth(),
        category: "OPERATOR",
        position: "Operator",
        phone: `08${Math.floor(1e9 + rnd() * 8.9e9)}`,
        skills,
        joinDate: addDays(today, -(400 + Math.floor(rnd() * 900))),
        cycleStartDate: addDays(today, -(offset + 14 * k)),
        pitId: pick(pitRows).id,
      });
    });
  }
  // Group Leader: 5 jenis × 2 orang (grup A & B)
  const glTypes = ["PRODUKSI", "DEWATERING", "MANPOWER", "OPD", "HAULING"] as const;
  let glNo = 2001;
  glTypes.forEach((t, i) => {
    for (const group of ["A", "B"] as const) {
      const name = t === "PRODUKSI" && group === "A" ? "Budi Santoso" : nextName();
      people.push({
        employeeNo: `GL${glNo++}`,
        name,
        birthDate: name === "Budi Santoso" ? "1985-08-20" : randomBirth(),
        category: "GROUP_LEADER",
        position: `GL ${t.charAt(0) + t.slice(1).toLowerCase()}`,
        glType: t,
        phone: `08${Math.floor(1e9 + rnd() * 8.9e9)}`,
        skills: [],
        joinDate: addDays(today, -(900 + Math.floor(rnd() * 900))),
        cycleStartDate: addDays(today, -((group === "A" ? 9 : 2) + 14 * (1 + ((i + (group === "A" ? 0 : 1)) % 3)))),
        pitId: pitRows[i % 3].id,
      });
    }
  });
  const personRows = await db.insert(s.personnel).values(people).returning();
  const byName = (n: string) => personRows.find((p) => p.name === n)!;

  // Penanggung jawab PIT
  const gls = personRows.filter((p) => p.glType === "PRODUKSI");
  await db.update(s.pits).set({ leaderId: gls[0].id }).where(eqId(s.pits.id, pitA.id));
  await db.update(s.pits).set({ leaderId: gls[1].id }).where(eqId(s.pits.id, pitB.id));
  const hauling = personRows.filter((p) => p.glType === "HAULING");
  await db.update(s.pits).set({ leaderId: hauling[0].id }).where(eqId(s.pits.id, pitC.id));

  // ── Akun ──
  const adminHash = await bcrypt.hash("Admin@12345", 10);
  const [superAdmin] = await db
    .insert(s.users)
    .values([
      { employeeNo: "SA0001", passwordHash: adminHash, role: "SUPER_ADMIN", displayName: "Super Administrator", mustChangePassword: false },
      { employeeNo: "AM0001", passwordHash: adminHash, role: "ADMIN_MANPOWER", displayName: "Admin Manpower", mustChangePassword: false },
    ])
    .returning();
  const userRows = [];
  for (const p of personRows) {
    userRows.push({
      employeeNo: p.employeeNo,
      passwordHash: await bcrypt.hash(birthDatePassword(p.birthDate), 10),
      role: (p.category === "GROUP_LEADER" ? "GROUP_LEADER" : "OPERATOR") as "GROUP_LEADER" | "OPERATOR",
      personnelId: p.id,
      mustChangePassword: true,
    });
  }
  const accounts = await db.insert(s.users).values(userRows).returning();
  const accountOf = (pid: string) => accounts.find((a) => a.personnelId === pid)!;

  // ── Cuti & status ──
  const ops = personRows.filter((p) => p.category === "OPERATOR");
  // 1) Operator sedang cuti (grup A, indeks 5)
  const onLeave = ops[5];
  const lvStart = addDays(today, -3);
  const lvEnd = addDays(lvStart, 13);
  const [lvRow] = await db.insert(s.leaves).values({ personnelId: onLeave.id, startDate: lvStart, endDate: lvEnd, status: "BERLANGSUNG", createdBy: "Super Administrator", note: "Cuti periodik terjadwal" }).returning();
  await db.update(s.personnel).set({ workStatus: "CUTI" }).where(eqId(s.personnel.id, onLeave.id));
  await db.insert(s.accountDeactivations).values({ userId: accountOf(onLeave.id).id, reason: "CUTI_PERIODIK", note: `leave:${lvRow.id}`, startDate: lvStart, endDate: lvEnd, createdBy: "Super Administrator" });
  // 2) Riwayat cuti selesai beberapa personel (sebelum siklus berjalan)
  for (const p of ops.slice(10, 16)) {
    const end = addDays(p.cycleStartDate, -1);
    await db.insert(s.leaves).values({ personnelId: p.id, startDate: addDays(end, -13), endDate: end, status: "SELESAI", createdBy: "Super Administrator" });
  }
  // 3) Operator sakit
  const sick = ops[33];
  await db.update(s.personnel).set({ workStatus: "SAKIT" }).where(eqId(s.personnel.id, sick.id));
  await db.insert(s.accountDeactivations).values({ userId: accountOf(sick.id).id, reason: "SAKIT", note: "Surat keterangan dokter", startDate: addDays(today, -1), endDate: addDays(today, 2), createdBy: "Admin Manpower" });
  // 4) Group Leader dengan cuti dijadwalkan
  const glLeave = personRows.find((p) => p.glType === "DEWATERING")!;
  const [glLv] = await db.insert(s.leaves).values({ personnelId: glLeave.id, startDate: addDays(today, 6), endDate: addDays(today, 19), status: "DIJADWALKAN", createdBy: "Admin Manpower" }).returning();
  await db.insert(s.accountDeactivations).values({ userId: accountOf(glLeave.id).id, reason: "CUTI_PERIODIK", note: `leave:${glLv.id}`, startDate: glLv.startDate, endDate: glLv.endDate, createdBy: "Admin Manpower" });
  // 5) Resign
  const resign = ops[54];
  await db.update(s.personnel).set({ workStatus: "RESIGN" }).where(eqId(s.personnel.id, resign.id));
  await db.update(s.users).set({ isActive: false, isArchived: true }).where(eqId(s.users.id, accountOf(resign.id).id));
  await db.insert(s.accountDeactivations).values({ userId: accountOf(resign.id).id, reason: "RESIGN", startDate: addDays(today, -20), createdBy: "Super Administrator" });

  // ── Penugasan kemarin & hari ini ──
  const unavailable = new Set([onLeave.id, sick.id, resign.id]);
  const groupA = ops.slice(0, skillPlan.length).filter((p) => !unavailable.has(p.id));
  const groupB = ops.slice(skillPlan.length).filter((p) => !unavailable.has(p.id));
  const opUnits = unitRows.filter((u) => u.status === "OPERASI");
  // Hari ini: A = Pagi, B = Malam. Kemarin: A (hari ke-2) Pagi, B (hari ke-9) Malam.
  for (const date of [addDays(today, -1), today]) {
    for (const [shift, pool] of [["PAGI", groupA], ["MALAM", groupB]] as const) {
      const used = new Set<string>();
      const rows: (typeof s.assignments.$inferInsert)[] = [];
      for (const u of opUnits) {
        // Sisakan 1 unit tanpa operator di shift malam hari ini untuk demo notifikasi
        if (date === today && shift === "MALAM" && u.code === "WT-0101") continue;
        const op = pool.find((p) => !used.has(p.id) && p.skills.includes(u.category));
        if (!op) continue;
        used.add(op.id);
        rows.push({ date, shift, personnelId: op.id, unitId: u.id, fleetId: u.fleetId, pitId: u.pitId, status: "PUBLISHED" });
      }
      if (rows.length) await db.insert(s.assignments).values(rows);
    }
  }
  // Pastikan Ahmad Nugraha menempati DT-042 hari ini (sesuai ilustrasi konsep)
  const ahmad = byName("Ahmad Nugraha");
  const dt042 = unitRows.find((u) => u.code === "DT-042")!;
  await pool.query(`DELETE FROM assignments WHERE date = $1 AND shift = 'PAGI' AND (personnel_id = $2 OR unit_id = $3)`, [today, ahmad.id, dt042.id]);
  await db.insert(s.assignments).values({ date: today, shift: "PAGI", personnelId: ahmad.id, unitId: dt042.id, fleetId: dt042.fleetId, pitId: dt042.pitId, status: "PUBLISHED" });

  await db.insert(s.auditLogs).values({ actorId: superAdmin.id, actorName: "Sistem", action: "SEED", entity: "Database", detail: "Data demo SIGAP dibuat" });

  console.log(`✓ ${personRows.length} personel, ${unitRows.length} unit, ${pitRows.length} PIT, ${fleetRows.length} fleet`);
  console.log("\nAkun demo:");
  console.log("  Super Admin     : SA0001 / Admin@12345");
  console.log("  Admin Manpower  : AM0001 / Admin@12345");
  console.log("  Operator        : OP1001 (Ahmad Nugraha) / 15051990  → wajib ganti password");
  console.log("  Group Leader    : GL2001 (Budi Santoso)  / 20081985  → wajib ganti password");
}

import { eq } from "drizzle-orm";
function eqId(col: Parameters<typeof eq>[0], v: string) {
  return eq(col, v);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
