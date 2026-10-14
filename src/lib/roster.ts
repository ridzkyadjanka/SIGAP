// Mesin roster SIGAP
//
// Aturan:
// - Pola default 7 Pagi (P) – 6 Malam (M) – 1 Libur (L) = siklus 14 hari.
// - Tanggal roster = tanggal MULAI shift. Shift malam hari ke-13 berakhir 06:00 hari ke-14,
//   dan hari ke-14 tetap Libur tanpa penugasan baru. Hari ke-15 = Pagi hari pertama siklus berikutnya.
// - Cuti periodik (C) menimpa pola. Setelah cuti selesai, siklus dimulai ulang dari hari ke-1
//   pada hari setelah cuti berakhir.
// - Perubahan manual (RosterOverride) menimpa pola otomatis pada tanggal tersebut.
// - Hari kerja untuk perhitungan cuti = hari P atau M pada roster aktual.

import { db } from "@/db";
import { leaves, rosterOverrides } from "@/db/schema";
import { and, gte, inArray, lte, ne } from "drizzle-orm";
import { addDays, diffDays, todayStr } from "./dates";
import { getSetting, type RosterPattern, type LeaveRules } from "./settings";

export type RosterCode = "P" | "M" | "L" | "C" | "-";

export type PersonRosterInput = {
  id: string;
  category: "OPERATOR" | "GROUP_LEADER";
  cycleStartDate: string;
  workStatus: string;
};

type LeaveLite = { id: string; startDate: string; endDate: string; status: string };

export type RosterContext = {
  pattern: RosterCode[];
  leavesByPerson: Map<string, LeaveLite[]>;
  overridesByPerson: Map<string, Map<string, string>>;
};

export function buildPattern(p: RosterPattern): RosterCode[] {
  return [
    ...Array<RosterCode>(Math.max(0, p.morning)).fill("P"),
    ...Array<RosterCode>(Math.max(0, p.night)).fill("M"),
    ...Array<RosterCode>(Math.max(0, p.off)).fill("L"),
  ];
}

/** Muat data cuti & override untuk sekumpulan personel (atau semua). */
export async function loadRosterContext(personIds?: string[]): Promise<RosterContext> {
  const pattern = buildPattern(await getSetting("roster_pattern"));
  if (personIds && personIds.length === 0) {
    return { pattern, leavesByPerson: new Map(), overridesByPerson: new Map() };
  }
  const lv = await db
    .select({
      id: leaves.id,
      personnelId: leaves.personnelId,
      startDate: leaves.startDate,
      endDate: leaves.endDate,
      status: leaves.status,
    })
    .from(leaves)
    .where(
      personIds
        ? and(ne(leaves.status, "DIBATALKAN"), inArray(leaves.personnelId, personIds))
        : ne(leaves.status, "DIBATALKAN")
    );
  const ov = await db
    .select()
    .from(rosterOverrides)
    .where(personIds ? inArray(rosterOverrides.personnelId, personIds) : undefined);

  const leavesByPerson = new Map<string, LeaveLite[]>();
  for (const l of lv) {
    const arr = leavesByPerson.get(l.personnelId) ?? [];
    arr.push(l);
    leavesByPerson.set(l.personnelId, arr);
  }
  for (const arr of leavesByPerson.values()) arr.sort((a, b) => a.startDate.localeCompare(b.startDate));

  const overridesByPerson = new Map<string, Map<string, string>>();
  for (const o of ov) {
    const m = overridesByPerson.get(o.personnelId) ?? new Map<string, string>();
    m.set(o.date, o.code);
    overridesByPerson.set(o.personnelId, m);
  }
  return { pattern, leavesByPerson, overridesByPerson };
}

/** Tanggal acuan siklus pada tanggal tertentu: tanggal mulai siklus atau hari setelah cuti terakhir. */
export function cycleAnchor(p: PersonRosterInput, ctx: RosterContext, date: string): string {
  let anchor = p.cycleStartDate;
  for (const l of ctx.leavesByPerson.get(p.id) ?? []) {
    if (l.endDate < date) {
      const next = addDays(l.endDate, 1);
      if (next > anchor) anchor = next;
    }
  }
  return anchor;
}

export function patternCode(p: PersonRosterInput, ctx: RosterContext, date: string): RosterCode {
  if (date < p.cycleStartDate) return "-";
  const anchor = cycleAnchor(p, ctx, date);
  const idx = ((diffDays(anchor, date) % ctx.pattern.length) + ctx.pattern.length) % ctx.pattern.length;
  return ctx.pattern[idx];
}

export function leaveOn(p: PersonRosterInput, ctx: RosterContext, date: string): LeaveLite | undefined {
  return (ctx.leavesByPerson.get(p.id) ?? []).find((l) => l.startDate <= date && date <= l.endDate);
}

/** Kode roster final pada tanggal tertentu. */
export function rosterCode(p: PersonRosterInput, ctx: RosterContext, date: string): RosterCode {
  if (p.workStatus === "RESIGN") return "-";
  if (leaveOn(p, ctx, date)) return "C";
  const ov = ctx.overridesByPerson.get(p.id)?.get(date);
  if (ov === "P" || ov === "M" || ov === "L") return ov;
  return patternCode(p, ctx, date);
}

export function isOverridden(p: PersonRosterInput, ctx: RosterContext, date: string): boolean {
  return ctx.overridesByPerson.get(p.id)?.has(date) ?? false;
}

export function rosterFor(p: PersonRosterInput, ctx: RosterContext, days: string[]) {
  return days.map((d) => ({ date: d, code: rosterCode(p, ctx, d), manual: isOverridden(p, ctx, d) }));
}

export function shiftCodeToRoster(shift: "PAGI" | "MALAM"): RosterCode {
  return shift === "PAGI" ? "P" : "M";
}

// ───────────── Estimasi cuti periodik ─────────────

export type LeaveEstimate = {
  personId: string;
  reference: string; // awal perhitungan hari kerja
  requiredWorkdays: number;
  workdaysDone: number; // s.d. hari ini
  startDate: string; // estimasi / jadwal mulai cuti
  endDate: string;
  daysUntil: number;
  scheduled: boolean; // sudah ditetapkan admin
  leaveId?: string;
  onLeave: boolean;
};

export function estimateLeave(
  p: PersonRosterInput,
  ctx: RosterContext,
  rules: LeaveRules,
  today = todayStr()
): LeaveEstimate {
  const required = p.category === "GROUP_LEADER" ? rules.glWorkdays : rules.operatorWorkdays;
  const personLeaves = ctx.leavesByPerson.get(p.id) ?? [];
  const current = personLeaves.find((l) => l.startDate <= today && today <= l.endDate);
  const upcoming = personLeaves.find((l) => l.startDate > today);

  // Acuan = hari setelah cuti terakhir yang sudah selesai, atau tanggal mulai siklus
  let reference = p.cycleStartDate;
  for (const l of personLeaves) {
    if (l.endDate < today) {
      const next = addDays(l.endDate, 1);
      if (next > reference) reference = next;
    }
  }

  // Hitung hari kerja aktual dari acuan sampai hari ini
  let workdaysDone = 0;
  if (!current) {
    for (let d = reference; d <= today; d = addDays(d, 1)) {
      const c = rosterCode(p, ctx, d);
      if (c === "P" || c === "M") workdaysDone++;
      if (diffDays(reference, d) > 800) break;
    }
  }

  if (current) {
    return {
      personId: p.id,
      reference,
      requiredWorkdays: required,
      workdaysDone: required,
      startDate: current.startDate,
      endDate: current.endDate,
      daysUntil: 0,
      scheduled: true,
      leaveId: current.id,
      onLeave: true,
    };
  }

  if (upcoming) {
    return {
      personId: p.id,
      reference,
      requiredWorkdays: required,
      workdaysDone,
      startDate: upcoming.startDate,
      endDate: upcoming.endDate,
      daysUntil: diffDays(today, upcoming.startDate),
      scheduled: true,
      leaveId: upcoming.id,
      onLeave: false,
    };
  }

  // Estimasi: cuti dimulai sehari setelah hari kerja ke-N tercapai
  let count = 0;
  let d = reference;
  let guard = 0;
  while (count < required && guard < 1000) {
    if (d < p.cycleStartDate) {
      d = addDays(d, 1);
      guard++;
      continue;
    }
    const c = rosterCode(p, ctx, d);
    if (c === "P" || c === "M") count++;
    if (count >= required) break;
    d = addDays(d, 1);
    guard++;
  }
  let start = addDays(d, 1);
  if (start < today) start = today; // sudah melewati batas → segera
  const end = addDays(start, rules.durationDays - 1);
  return {
    personId: p.id,
    reference,
    requiredWorkdays: required,
    workdaysDone,
    startDate: start,
    endDate: end,
    daysUntil: diffDays(today, start),
    scheduled: false,
    onLeave: false,
  };
}

/** Estimasi cuti untuk seluruh personel aktif. */
export async function estimateAllLeaves(today = todayStr()) {
  const people = await db.query.personnel.findMany({
    where: (p, { ne }) => ne(p.workStatus, "RESIGN"),
    with: { pit: true },
    orderBy: (p, { asc }) => asc(p.name),
  });
  const ctx = await loadRosterContext();
  const rules = await getSetting("leave_rules");
  return people.map((p) => ({ person: p, estimate: estimateLeave(p, ctx, rules, today) }));
}

/** Cek apakah ada cuti lain yang beririsan untuk seseorang. */
export async function hasOverlappingLeave(personnelId: string, start: string, end: string, excludeId?: string) {
  const rows = await db
    .select({ id: leaves.id })
    .from(leaves)
    .where(
      and(
        inArray(leaves.personnelId, [personnelId]),
        ne(leaves.status, "DIBATALKAN"),
        lte(leaves.startDate, end),
        gte(leaves.endDate, start)
      )
    );
  return rows.some((r) => r.id !== excludeId);
}

