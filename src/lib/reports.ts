// Pembangun laporan operasional SIGAP (dipakai untuk preview, PDF, dan Excel)
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { assignmentHistory, assignments, fleets, leaves, personnel, pits, units } from "@/db/schema";
import { addDays, diffDays, formatDate, isValidDate, rangeDays, todayStr } from "./dates";
import { loadRosterContext, rosterCode } from "./roster";
import { availabilityFor } from "./operations";
import { getShiftTimes } from "./shifts";
import { LEAVE_STATUS, SHIFT_SHORT, UNIT_STATUS, glTypeLabel, unitCategoryLabel } from "./constants";

export const REPORT_TYPES = [
  { key: "daily-manpower", title: "Daily Manpower Report", desc: "Penugasan operator per unit untuk satu tanggal.", single: true },
  { key: "operator-assignment", title: "Operator Assignment Report", desc: "Riwayat penugasan operator per periode." },
  { key: "gl-assignment", title: "Group Leader Assignment Report", desc: "Penempatan & shift Group Leader per periode." },
  { key: "roster", title: "Roster Report", desc: "Roster harian personel (maks. 31 hari)." },
  { key: "periodic-leave", title: "Periodic Leave Report", desc: "Cuti periodik dalam periode beserta pengganti." },
  { key: "fleet-equipment", title: "Fleet & Equipment Report", desc: "Kondisi unit, fleet, lokasi, dan operator pada tanggal akhir." },
  { key: "manpower-availability", title: "Manpower Availability Report", desc: "Ketersediaan operator vs kebutuhan unit per hari & shift." },
  { key: "replacement-history", title: "Replacement History Report", desc: "Pengganti cuti & Quick Replacement per periode." },
] as const;

export type ReportKey = (typeof REPORT_TYPES)[number]["key"];

export type ReportFilters = { from: string; to: string; pit?: string; shift?: string; cat?: string };

export type Report = {
  key: ReportKey;
  title: string;
  period: string;
  filtersText: string;
  columns: string[];
  rows: (string | number)[][];
  summary?: { label: string; value: string | number }[];
};

export function parseFilters(sp: Record<string, string | undefined>): ReportFilters {
  const today = todayStr();
  let from = isValidDate(sp.from) ? sp.from : addDays(today, -6);
  let to = isValidDate(sp.to) ? sp.to : today;
  if (to < from) [from, to] = [to, from];
  return { from, to, pit: sp.pit || undefined, shift: sp.shift === "PAGI" || sp.shift === "MALAM" ? sp.shift : undefined, cat: sp.cat || undefined };
}

export async function buildReport(key: ReportKey, f: ReportFilters): Promise<Report> {
  const meta = REPORT_TYPES.find((r) => r.key === key)!;
  const pit = f.pit ? await db.query.pits.findFirst({ where: eq(pits.id, f.pit) }) : null;
  const single = "single" in meta && meta.single;
  const period = single ? formatDate(f.to, { withDay: true }) : `${formatDate(f.from)} s.d. ${formatDate(f.to)}`;
  const filtersText = [pit ? `Lokasi: ${pit.name}` : "Semua lokasi", f.shift ? `Shift ${SHIFT_SHORT[f.shift]}` : "Semua shift", f.cat ? (f.cat === "OPERATOR" ? "Operator" : "Group Leader") : null]
    .filter(Boolean)
    .join(" · ");
  const base = { key, title: meta.title, period, filtersText };

  switch (key) {
    case "daily-manpower": {
      const date = f.to;
      const rows = await db
        .select({ shift: assignments.shift, status: assignments.status, unit: units.code, cat: units.category, model: units.model, op: personnel.name, no: personnel.employeeNo, fleet: fleets.code, pit: pits.code, pitId: assignments.pitId })
        .from(assignments)
        .innerJoin(units, eq(units.id, assignments.unitId))
        .innerJoin(personnel, eq(personnel.id, assignments.personnelId))
        .leftJoin(fleets, eq(fleets.id, assignments.fleetId))
        .leftJoin(pits, eq(pits.id, assignments.pitId))
        .where(eq(assignments.date, date))
        .orderBy(asc(assignments.shift), asc(pits.code), asc(units.code));
      const filtered = rows.filter((r) => (!f.pit || r.pitId === f.pit) && (!f.shift || r.shift === f.shift));
      const times = { PAGI: await getShiftTimes(date, "PAGI"), MALAM: await getShiftTimes(date, "MALAM") };
      const opUnits = (await db.select().from(units).where(eq(units.status, "OPERASI"))).filter((u) => !f.pit || u.pitId === f.pit);
      return {
        ...base,
        columns: ["Shift", "PIT", "Fleet", "Unit", "Jenis Unit", "Operator", "No. Pegawai", "Jam Kerja", "Status"],
        rows: filtered.map((r) => [SHIFT_SHORT[r.shift], r.pit ?? "-", r.fleet ?? "-", r.unit, `${unitCategoryLabel(r.cat)} ${r.model}`, r.op, r.no, `${times[r.shift].startTime}–${times[r.shift].endTime}`, r.status]),
        summary: [
          { label: "Unit beroperasi", value: opUnits.length },
          { label: "Penugasan Shift Pagi", value: filtered.filter((r) => r.shift === "PAGI").length },
          { label: "Penugasan Shift Malam", value: filtered.filter((r) => r.shift === "MALAM").length },
        ],
      };
    }
    case "operator-assignment": {
      const rows = await db
        .select({ date: assignments.date, shift: assignments.shift, status: assignments.status, unit: units.code, cat: units.category, op: personnel.name, no: personnel.employeeNo, fleet: fleets.code, pit: pits.code, pitId: assignments.pitId })
        .from(assignments)
        .innerJoin(units, eq(units.id, assignments.unitId))
        .innerJoin(personnel, eq(personnel.id, assignments.personnelId))
        .leftJoin(fleets, eq(fleets.id, assignments.fleetId))
        .leftJoin(pits, eq(pits.id, assignments.pitId))
        .where(and(gte(assignments.date, f.from), lte(assignments.date, f.to)))
        .orderBy(asc(assignments.date), asc(assignments.shift), asc(personnel.name));
      const filtered = rows.filter((r) => (!f.pit || r.pitId === f.pit) && (!f.shift || r.shift === f.shift));
      return {
        ...base,
        columns: ["Tanggal", "Shift", "Operator", "No. Pegawai", "Unit", "Jenis", "Fleet", "PIT", "Status"],
        rows: filtered.map((r) => [formatDate(r.date, { short: true }), SHIFT_SHORT[r.shift], r.op, r.no, r.unit, unitCategoryLabel(r.cat), r.fleet ?? "-", r.pit ?? "-", r.status]),
        summary: [
          { label: "Total penugasan", value: filtered.length },
          { label: "Operator unik", value: new Set(filtered.map((r) => r.no)).size },
        ],
      };
    }
    case "gl-assignment": {
      const days = rangeDays(f.from, f.to).slice(0, 62);
      const gls = (await db.query.personnel.findMany({ where: eq(personnel.category, "GROUP_LEADER"), with: { pit: true }, orderBy: asc(personnel.name) })).filter((g) => g.workStatus !== "RESIGN" && (!f.pit || g.pitId === f.pit));
      const ctx = await loadRosterContext(gls.map((g) => g.id));
      const times = { PAGI: await getShiftTimes(f.from, "PAGI"), MALAM: await getShiftTimes(f.from, "MALAM") };
      const rows: (string | number)[][] = [];
      for (const d of days) {
        for (const g of gls) {
          const c = rosterCode(g, ctx, d);
          if (c !== "P" && c !== "M") continue;
          const shift = c === "P" ? "PAGI" : "MALAM";
          if (f.shift && f.shift !== shift) continue;
          rows.push([formatDate(d, { short: true }), g.name, g.employeeNo, glTypeLabel(g.glType), g.pit?.code ?? "-", SHIFT_SHORT[shift], `${times[shift].startTime}–${times[shift].endTime}`]);
        }
      }
      return { ...base, columns: ["Tanggal", "Group Leader", "No. Pegawai", "Jenis GL", "PIT", "Shift", "Jam Kerja"], rows, summary: [{ label: "Group Leader", value: gls.length }, { label: "Total shift kerja", value: rows.length }] };
    }
    case "roster": {
      const to = diffDays(f.from, f.to) > 30 ? addDays(f.from, 30) : f.to;
      const days = rangeDays(f.from, to);
      const people = (await db.query.personnel.findMany({ with: { pit: true }, orderBy: asc(personnel.name) })).filter((p) => p.workStatus !== "RESIGN" && (!f.cat || p.category === f.cat) && (!f.pit || p.pitId === f.pit));
      const ctx = await loadRosterContext(people.map((p) => p.id));
      return {
        ...base,
        period: `${formatDate(f.from)} s.d. ${formatDate(to)}`,
        columns: ["Nama", "No. Pegawai", ...days.map((d) => d.slice(8))],
        rows: people.map((p) => [p.name, p.employeeNo, ...days.map((d) => rosterCode(p, ctx, d))]),
        summary: [{ label: "Keterangan", value: "P = Pagi, M = Malam, L = Libur, C = Cuti, - = Tidak ada" }],
      };
    }
    case "periodic-leave": {
      const rows = await db.query.leaves.findMany({
        where: and(lte(leaves.startDate, f.to), gte(leaves.endDate, f.from)),
        with: { personnel: true, replacements: { with: { replacementPersonnel: true } } },
        orderBy: asc(leaves.startDate),
      });
      const filtered = rows.filter((l) => (!f.cat || l.personnel.category === f.cat) && (!f.pit || l.personnel.pitId === f.pit));
      return {
        ...base,
        columns: ["Nama", "No. Pegawai", "Kategori", "Mulai", "Selesai", "Durasi", "Status", "Pengganti"],
        rows: filtered.map((l) => [
          l.personnel.name,
          l.personnel.employeeNo,
          l.personnel.category === "OPERATOR" ? "Operator" : glTypeLabel(l.personnel.glType),
          formatDate(l.startDate, { short: true }),
          formatDate(l.endDate, { short: true }),
          `${diffDays(l.startDate, l.endDate) + 1} hari`,
          LEAVE_STATUS[l.status].label,
          l.replacements.map((r) => r.replacementPersonnel.name).join(", ") || "-",
        ]),
        summary: [{ label: "Total cuti", value: filtered.length }, { label: "Tanpa pengganti", value: filtered.filter((l) => !l.replacements.length && l.status !== "DIBATALKAN").length }],
      };
    }
    case "fleet-equipment": {
      const list = (await db.query.units.findMany({ with: { fleet: true, pit: true }, orderBy: asc(units.code) })).filter((u) => !f.pit || u.pitId === f.pit);
      const asg = await db
        .select({ unitId: assignments.unitId, shift: assignments.shift, name: personnel.name })
        .from(assignments)
        .innerJoin(personnel, eq(personnel.id, assignments.personnelId))
        .where(eq(assignments.date, f.to));
      return {
        ...base,
        period: formatDate(f.to, { withDay: true }),
        columns: ["Unit", "Jenis", "Model", "Fleet", "PIT", "Status", "Operator Pagi", "Operator Malam"],
        rows: list.map((u) => [
          u.code,
          unitCategoryLabel(u.category),
          u.model,
          u.fleet?.code ?? "-",
          u.pit?.code ?? "-",
          UNIT_STATUS.find((s) => s.value === u.status)!.label,
          asg.find((a) => a.unitId === u.id && a.shift === "PAGI")?.name ?? "-",
          asg.find((a) => a.unitId === u.id && a.shift === "MALAM")?.name ?? "-",
        ]),
        summary: UNIT_STATUS.map((s) => ({ label: s.label, value: list.filter((u) => u.status === s.value).length })),
      };
    }
    case "manpower-availability": {
      const to = diffDays(f.from, f.to) > 30 ? addDays(f.from, 30) : f.to;
      const opUnits = (await db.select().from(units).where(eq(units.status, "OPERASI"))).length;
      const rows: (string | number)[][] = [];
      for (const d of rangeDays(f.from, to)) {
        for (const shift of ["PAGI", "MALAM"] as const) {
          if (f.shift && f.shift !== shift) continue;
          const av = await availabilityFor(d, shift);
          const ready = av.filter((a) => a.available || a.assignedUnit).length;
          rows.push([
            formatDate(d, { short: true }),
            SHIFT_SHORT[shift],
            opUnits,
            ready,
            av.filter((a) => a.assignedUnit).length,
            av.filter((a) => a.code === "C").length,
            av.filter((a) => a.workStatus === "SAKIT").length,
            av.filter((a) => a.code === "L").length,
            ready - opUnits,
          ]);
        }
      }
      return {
        ...base,
        period: `${formatDate(f.from)} s.d. ${formatDate(to)}`,
        columns: ["Tanggal", "Shift", "Kebutuhan Unit", "Operator Tersedia", "Ditugaskan", "Cuti", "Sakit", "Libur", "Selisih"],
        rows,
        summary: [{ label: "Hari-shift kekurangan", value: rows.filter((r) => Number(r[8]) < 0).length }],
      };
    }
    case "replacement-history": {
      const reps = await db.query.replacements.findMany({
        where: (r, { and, lte, gte }) => and(lte(r.startDate, f.to), gte(r.endDate, f.from)),
        with: { leave: { with: { personnel: true } }, replacementPersonnel: true },
      });
      const quick = await db
        .select()
        .from(assignmentHistory)
        .where(and(eq(assignmentHistory.action, "QUICK_REPLACEMENT"), gte(assignmentHistory.date, f.from), lte(assignmentHistory.date, f.to)))
        .orderBy(desc(assignmentHistory.date));
      const rows: (string | number)[][] = [
        ...reps.map((r) => ["Pengganti Cuti", `${formatDate(r.startDate, { short: true })} – ${formatDate(r.endDate, { short: true })}`, r.unitCode ?? "-", r.leave.personnel.name, r.replacementPersonnel.name, r.note ?? "-", r.createdBy]),
        ...quick.filter((q) => !f.shift || q.shift === f.shift).map((q) => ["Quick Replacement", `${formatDate(q.date, { short: true })} (${SHIFT_SHORT[q.shift]})`, q.unitCode, q.previousPersonnel ?? "-", q.newPersonnel ?? "-", q.reason ?? "-", q.changedBy]),
      ];
      return {
        ...base,
        columns: ["Jenis", "Periode/Tanggal", "Unit", "Personel Digantikan", "Pengganti", "Alasan", "Oleh"],
        rows,
        summary: [{ label: "Pengganti cuti", value: reps.length }, { label: "Quick Replacement", value: quick.length }],
      };
    }
  }
}
