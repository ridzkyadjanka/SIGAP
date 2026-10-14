import { db } from "@/db";
import { shiftConfigs, shiftOverrides } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type ShiftTimes = {
  code: "PAGI" | "MALAM";
  name: string;
  startTime: string;
  endTime: string;
  breakStart: string;
  breakEnd: string;
  overridden?: boolean;
  reason?: string;
};

export const DEFAULT_SHIFTS: ShiftTimes[] = [
  { code: "PAGI", name: "Shift 1 — Pagi", startTime: "07:00", endTime: "18:00", breakStart: "12:00", breakEnd: "13:00" },
  { code: "MALAM", name: "Shift 2 — Malam", startTime: "19:00", endTime: "06:00", breakStart: "00:00", breakEnd: "01:00" },
];

export async function getShiftConfigs(): Promise<ShiftTimes[]> {
  const rows = await db.select().from(shiftConfigs);
  return DEFAULT_SHIFTS.map((d) => {
    const r = rows.find((x) => x.code === d.code);
    return r ? { ...d, ...r } : d;
  });
}

/** Jam kerja efektif untuk tanggal + shift (+PIT). Override PIT spesifik > override umum > standar. */
export async function getShiftTimes(date: string, shift: "PAGI" | "MALAM", pitId?: string | null): Promise<ShiftTimes> {
  const base = (await getShiftConfigs()).find((s) => s.code === shift)!;
  const ovs = await db
    .select()
    .from(shiftOverrides)
    .where(and(eq(shiftOverrides.date, date), eq(shiftOverrides.shift, shift)));
  const ov = (pitId && ovs.find((o) => o.pitId === pitId)) || ovs.find((o) => !o.pitId);
  if (!ov) return base;
  return {
    ...base,
    startTime: ov.startTime,
    endTime: ov.endTime,
    breakStart: ov.breakStart,
    breakEnd: ov.breakEnd,
    overridden: true,
    reason: ov.reason,
  };
}

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function durations(s: { startTime: string; endTime: string; breakStart: string; breakEnd: string }) {
  let total = toMin(s.endTime) - toMin(s.startTime);
  if (total <= 0) total += 24 * 60;
  let brk = toMin(s.breakEnd) - toMin(s.breakStart);
  if (brk < 0) brk += 24 * 60;
  return { totalHours: total / 60, effectiveHours: (total - brk) / 60, breakHours: brk / 60 };
}

export function isValidTime(t: unknown): t is string {
  return typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}
