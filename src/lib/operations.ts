// Logika operasional: ketersediaan personel, kandidat pengganti, notifikasi otomatis, dan sinkronisasi status cuti.
import { db } from "@/db";
import {
  accountDeactivations,
  assignments,
  leaves,
  notifications,
  personnel,
  replacements,
  settings,
  units,
  users,
} from "@/db/schema";
import { and, desc, eq, gte, inArray, isNull, lt, lte, ne, or } from "drizzle-orm";
import { formatDate, rangeDays, todayStr } from "./dates";
import { estimateLeave, leaveOn, loadRosterContext, rosterCode, shiftCodeToRoster } from "./roster";
import { getSetting } from "./settings";
import { activeDeactivation } from "./auth";
import { unitCategoryLabel } from "./constants";

// ───────────── Notifikasi ─────────────

type NotifInput = { key?: string; type: string; title: string; message: string; link?: string };

export async function notifyAdmins(n: NotifInput) {
  await db
    .insert(notifications)
    .values({ ...n, forAdmin: true })
    .onConflictDoNothing({ target: notifications.key });
}

export async function notifyPersonnel(personnelIds: string[], n: NotifInput) {
  if (!personnelIds.length) return;
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.personnelId, personnelIds));
  if (!rows.length) return;
  await db
    .insert(notifications)
    .values(rows.map((u) => ({ ...n, key: n.key ? `${n.key}:${u.id}` : undefined, userId: u.id })))
    .onConflictDoNothing({ target: notifications.key });
}

// ───────────── Ketersediaan ─────────────

export type Availability = {
  id: string;
  name: string;
  employeeNo: string;
  category: string;
  skills: string[];
  workStatus: string;
  code: string;
  accountBlocked: boolean;
  assignedUnit?: string | null;
  available: boolean;
  reason?: string;
};

/** Daftar personel beserta status ketersediaan untuk tanggal & shift tertentu. */
export async function availabilityFor(
  date: string,
  shift: "PAGI" | "MALAM",
  category: "OPERATOR" | "GROUP_LEADER" = "OPERATOR"
): Promise<Availability[]> {
  const people = await db.query.personnel.findMany({
    where: and(eq(personnel.category, category), ne(personnel.workStatus, "RESIGN")),
    with: { user: true },
    orderBy: (p, { asc }) => asc(p.name),
  });
  const ctx = await loadRosterContext(people.map((p) => p.id));
  const assigned = await db
    .select({ personnelId: assignments.personnelId, unitCode: units.code, shift: assignments.shift })
    .from(assignments)
    .innerJoin(units, eq(units.id, assignments.unitId))
    .where(eq(assignments.date, date));

  const need = shiftCodeToRoster(shift);
  const deacts = await db
    .select({ userId: accountDeactivations.userId })
    .from(accountDeactivations)
    .where(
      and(
        eq(accountDeactivations.cancelled, false),
        lte(accountDeactivations.startDate, date),
        or(isNull(accountDeactivations.endDate), gte(accountDeactivations.endDate, date))
      )
    );
  const blockedUsers = new Set(deacts.map((d) => d.userId));
  const out: Availability[] = [];
  for (const p of people) {
    const code = rosterCode(p, ctx, date);
    const blocked = p.user ? blockedUsers.has(p.user.id) || !p.user.isActive : false;
    const sameShift = assigned.find((a) => a.personnelId === p.id && a.shift === shift);
    const otherShift = assigned.find((a) => a.personnelId === p.id && a.shift !== shift);
    let reason: string | undefined;
    if (p.workStatus === "SAKIT") reason = "Sedang sakit";
    else if (p.workStatus === "CUTI" || code === "C") reason = "Sedang cuti periodik";
    else if (code === "L") reason = "Libur roster";
    else if (code === "-") reason = "Belum ada roster";
    else if (code !== need) reason = `Roster ${code === "P" ? "Pagi" : "Malam"}`;
    else if (blocked) reason = "Akun nonaktif";
    else if (otherShift) reason = `Sudah bertugas shift lain (${otherShift.unitCode})`;
    out.push({
      id: p.id,
      name: p.name,
      employeeNo: p.employeeNo,
      category: p.category,
      skills: p.skills,
      workStatus: p.workStatus,
      code,
      accountBlocked: blocked,
      assignedUnit: sameShift?.unitCode ?? null,
      available: !reason,
      reason,
    });
  }
  return out;
}

// ───────────── Kandidat pengganti cuti ─────────────

export type ReplacementCandidate = {
  id: string;
  name: string;
  employeeNo: string;
  skills: string[];
  pitName: string | null;
  workdaysInPeriod: number;
  totalDays: number;
  startCode: string;
  conflicts: string[];
  eligible: boolean;
};

/** Skill/unit yang dibutuhkan dari personel yang akan cuti (unit terakhir yang dioperasikan). */
export async function lastUnitOf(personnelId: string) {
  const last = await db
    .select({ code: units.code, category: units.category, model: units.model, date: assignments.date })
    .from(assignments)
    .innerJoin(units, eq(units.id, assignments.unitId))
    .where(eq(assignments.personnelId, personnelId))
    .orderBy(desc(assignments.date))
    .limit(1);
  return last[0] ?? null;
}

export async function replacementCandidates(opts: {
  personId: string;
  start: string;
  end: string;
  skill?: string | null;
}): Promise<ReplacementCandidate[]> {
  const target = await db.query.personnel.findFirst({ where: eq(personnel.id, opts.personId) });
  if (!target) return [];
  const pool = await db.query.personnel.findMany({
    where: and(
      eq(personnel.category, target.category),
      ne(personnel.id, target.id),
      ne(personnel.workStatus, "RESIGN")
    ),
    with: { user: true, pit: true },
    orderBy: (p, { asc }) => asc(p.name),
  });
  const ctx = await loadRosterContext(pool.map((p) => p.id));
  const days = rangeDays(opts.start, opts.end);
  const repl = await db
    .select()
    .from(replacements)
    .where(and(lte(replacements.startDate, opts.end), gte(replacements.endDate, opts.start)));

  const out: ReplacementCandidate[] = [];
  for (const p of pool) {
    // Kesesuaian skill (operator) atau jenis GL yang sama (group leader)
    if (target.category === "OPERATOR" && opts.skill && !p.skills.includes(opts.skill)) continue;
    if (target.category === "GROUP_LEADER" && p.glType !== target.glType) continue;

    const conflicts: string[] = [];
    if (p.workStatus === "SAKIT") conflicts.push("Sedang sakit");
    if (p.workStatus === "CUTI") conflicts.push("Sedang cuti");
    if (days.some((d) => leaveOn(p, ctx, d))) conflicts.push("Cuti periodik beririsan dengan periode");
    if (repl.some((r) => r.replacementPersonnelId === p.id)) conflicts.push("Sudah menjadi pengganti di periode ini");
    if (p.user && (!p.user.isActive || (await activeDeactivation(p.user.id, opts.start))))
      conflicts.push("Akun nonaktif");
    const startCode = rosterCode(p, ctx, opts.start);
    if (startCode === "L") conflicts.push("Libur roster pada tanggal mulai");
    const workdays = days.filter((d) => {
      const c = rosterCode(p, ctx, d);
      return c === "P" || c === "M";
    }).length;
    out.push({
      id: p.id,
      name: p.name,
      employeeNo: p.employeeNo,
      skills: p.skills,
      pitName: p.pit?.name ?? null,
      workdaysInPeriod: workdays,
      totalDays: days.length,
      startCode,
      conflicts,
      eligible: conflicts.length === 0,
    });
  }
  return out.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.workdaysInPeriod - a.workdaysInPeriod);
}

// ───────────── Sinkronisasi & notifikasi otomatis ─────────────

let lastRun = 0;

/** Dijalankan saat admin membuka panel (maks. 1x per 5 menit, atau paksa). */
export async function runMaintenance(force = false) {
  if (!force && Date.now() - lastRun < 5 * 60 * 1000) return;
  lastRun = Date.now();
  // Penanda bersama di database agar banyak instance serverless tidak menjalankan ulang terus-menerus
  if (!force) {
    const row = await db.query.settings.findFirst({ where: eq(settings.key, "maintenance_at") });
    const last = row ? Number(row.value) : 0;
    if (Date.now() - last < 5 * 60 * 1000) return;
  }
  await db
    .insert(settings)
    .values({ key: "maintenance_at", value: Date.now() })
    .onConflictDoUpdate({ target: settings.key, set: { value: Date.now() } });
  const today = todayStr();
  try {
    await syncLeaveStatuses(today);
    await syncSickStatuses(today);
    await leaveWarnings(today);
    await coverageWarnings(today);
  } catch (e) {
    console.error("[SIGAP] maintenance gagal:", e);
  }
}

async function syncLeaveStatuses(today: string) {
  // Cuti dimulai
  const starting = await db
    .select()
    .from(leaves)
    .where(and(eq(leaves.status, "DIJADWALKAN"), lte(leaves.startDate, today), gte(leaves.endDate, today)));
  for (const l of starting) {
    await db.update(leaves).set({ status: "BERLANGSUNG" }).where(eq(leaves.id, l.id));
    await db
      .update(personnel)
      .set({ workStatus: "CUTI" })
      .where(and(eq(personnel.id, l.personnelId), eq(personnel.workStatus, "AKTIF")));
  }
  // Cuti selesai
  const finished = await db
    .select()
    .from(leaves)
    .where(and(inArray(leaves.status, ["DIJADWALKAN", "BERLANGSUNG"]), lt(leaves.endDate, today)));
  for (const l of finished) {
    await db.update(leaves).set({ status: "SELESAI" }).where(eq(leaves.id, l.id));
    await db
      .update(personnel)
      .set({ workStatus: "AKTIF" })
      .where(and(eq(personnel.id, l.personnelId), eq(personnel.workStatus, "CUTI")));
  }
}

/** Personel sakit yang masa sakitnya sudah berakhir otomatis kembali aktif. */
async function syncSickStatuses(today: string) {
  const sick = await db.query.personnel.findMany({ where: eq(personnel.workStatus, "SAKIT"), with: { user: true } });
  for (const p of sick) {
    if (!p.user) continue;
    const rows = await db
      .select()
      .from(accountDeactivations)
      .where(and(eq(accountDeactivations.userId, p.user.id), eq(accountDeactivations.reason, "SAKIT"), eq(accountDeactivations.cancelled, false)));
    if (rows.length && rows.every((r) => r.endDate && r.endDate < today)) {
      await db.update(personnel).set({ workStatus: "AKTIF" }).where(eq(personnel.id, p.id));
    }
  }
}

async function leaveWarnings(today: string) {
  const thresholds = [...(await getSetting("warning_days"))].sort((a, b) => a - b);
  if (!thresholds.length) return;
  const max = thresholds[thresholds.length - 1];
  const people = await db.query.personnel.findMany({
    where: ne(personnel.workStatus, "RESIGN"),
    with: { pit: true },
  });
  const ctx = await loadRosterContext();
  const rules = await getSetting("leave_rules");
  for (const p of people) {
    const est = estimateLeave(p, ctx, rules, today);
    if (est.onLeave || est.daysUntil > max || est.daysUntil < 0) continue;
    const tier = thresholds.find((t) => est.daysUntil <= t);
    if (tier === undefined) continue;
    const last = p.category === "OPERATOR" ? await lastUnitOf(p.id) : null;
    const who = p.category === "OPERATOR" ? "Operator" : "Group Leader";
    const unitInfo = last ? ` Unit terakhir: ${last.code} (${unitCategoryLabel(last.category)}).` : "";
    await notifyAdmins({
      key: `leave:${p.id}:${est.startDate}:H-${tier}`,
      type: tier <= 3 ? "LEAVE_URGENT" : "LEAVE_UPCOMING",
      title: `Periodic Leave Alert — ${daysLabel(est.daysUntil)}`,
      message: `${who} ${p.name} akan memasuki cuti periodik dalam ${est.daysUntil} hari (${formatDate(est.startDate)}).${unitInfo} Lokasi: ${p.pit?.name ?? "-"}.`,
      link: `/admin/early-warning?person=${p.id}`,
    });
  }
}

async function coverageWarnings(today: string) {
  const opUnits = await db.select().from(units).where(eq(units.status, "OPERASI"));
  if (!opUnits.length) return;
  for (const shift of ["PAGI", "MALAM"] as const) {
    const asg = await db
      .select({ unitId: assignments.unitId })
      .from(assignments)
      .where(and(eq(assignments.date, today), eq(assignments.shift, shift)));
    const covered = new Set(asg.map((a) => a.unitId));
    const empty = opUnits.filter((u) => !covered.has(u.id));
    if (empty.length) {
      await notifyAdmins({
        key: `nounit:${today}:${shift}:${empty.length}`,
        type: "UNIT_NO_OPERATOR",
        title: `Unit belum memiliki operator (${shift === "PAGI" ? "Shift Pagi" : "Shift Malam"})`,
        message: `${empty.length} unit beroperasi belum memiliki operator hari ini: ${empty
          .slice(0, 6)
          .map((u) => u.code)
          .join(", ")}${empty.length > 6 ? ", …" : ""}.`,
        link: `/admin/penugasan?date=${today}&shift=${shift}`,
      });
    }
    const avail = await availabilityFor(today, shift);
    const ready = avail.filter((a) => a.available || a.assignedUnit).length;
    if (ready < opUnits.length) {
      await notifyAdmins({
        key: `short:${today}:${shift}`,
        type: "MANPOWER_SHORTAGE",
        title: `Kekurangan manpower (${shift === "PAGI" ? "Shift Pagi" : "Shift Malam"})`,
        message: `Operator tersedia ${ready} orang, sedangkan unit beroperasi ${opUnits.length} unit. Kekurangan ${opUnits.length - ready} operator.`,
        link: `/admin/penugasan?date=${today}&shift=${shift}`,
      });
    }
  }
  // Operator tidak tersedia namun memiliki penugasan
  const sick = await db
    .select({ name: personnel.name, id: personnel.id, unit: units.code, shift: assignments.shift })
    .from(assignments)
    .innerJoin(personnel, eq(personnel.id, assignments.personnelId))
    .innerJoin(units, eq(units.id, assignments.unitId))
    .where(and(eq(assignments.date, today), inArray(personnel.workStatus, ["SAKIT", "CUTI"])));
  for (const s of sick) {
    await notifyAdmins({
      key: `unavail:${today}:${s.id}:${s.shift}`,
      type: "OPERATOR_UNAVAILABLE",
      title: "Operator tidak tersedia",
      message: `${s.name} tidak tersedia namun ditugaskan pada unit ${s.unit} hari ini. Lakukan Quick Replacement.`,
      link: `/admin/penugasan?date=${today}&shift=${s.shift}`,
    });
  }
}

export function daysLabel(n: number) {
  if (n === 0) return "Hari ini";
  if (n === 1) return "Besok";
  return `H-${n}`;
}

