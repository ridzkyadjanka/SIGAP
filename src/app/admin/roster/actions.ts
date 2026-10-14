"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { assignments, personnel, rosterOverrides, shiftConfigs, shiftOverrides } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { fail, ok, optStr, str, type ActionResult } from "@/lib/action";
import { addDays, formatDate, isValidDate, rangeDays } from "@/lib/dates";
import { loadRosterContext, rosterCode } from "@/lib/roster";
import { logAudit } from "@/lib/audit";
import { notifyAdmins, notifyPersonnel } from "@/lib/operations";
import { isValidTime } from "@/lib/shifts";

/** Cek benturan penugasan jika roster berubah. */
async function assignmentConflicts(personIds: string[], start: string, end: string, resolveCode: (pid: string, date: string) => string) {
  const rows = await db
    .select({ personnelId: assignments.personnelId, date: assignments.date, shift: assignments.shift, name: personnel.name })
    .from(assignments)
    .innerJoin(personnel, eq(personnel.id, assignments.personnelId))
    .where(and(inArray(assignments.personnelId, personIds), gte(assignments.date, start), lte(assignments.date, end)));
  return rows.filter((a) => {
    const c = resolveCode(a.personnelId, a.date);
    return !((c === "P" && a.shift === "PAGI") || (c === "M" && a.shift === "MALAM"));
  });
}

/** Buat roster otomatis: tetapkan tanggal mulai siklus (Hari ke-1 = Pagi). */
export async function generateRoster(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const ids = fd.getAll("personIds").map(String);
  const start = str(fd, "startDate");
  const clearManual = fd.get("clearManual") === "on";
  const force = fd.get("force") === "on";
  if (!ids.length) return fail("Pilih minimal satu personel.");
  if (!isValidDate(start)) return fail("Tanggal awal siklus tidak valid.");

  const people = await db.query.personnel.findMany({ where: inArray(personnel.id, ids) });
  const ctx = await loadRosterContext(ids);
  // Simulasikan roster baru 60 hari untuk mendeteksi benturan penugasan
  const horizonEnd = addDays(start, 60);
  const simulated = people.map((p) => ({ ...p, cycleStartDate: start }));
  if (clearManual) for (const id of ids) ctx.overridesByPerson.delete(id);
  const conflicts = await assignmentConflicts(ids, start, horizonEnd, (pid, d) => {
    const p = simulated.find((x) => x.id === pid)!;
    return rosterCode(p, ctx, d);
  });
  if (conflicts.length && !force) {
    return fail(
      `Terdapat ${conflicts.length} penugasan yang berbenturan dengan roster baru (mis. ${conflicts
        .slice(0, 3)
        .map((c) => `${c.name} ${formatDate(c.date, { short: true })} ${c.shift}`)
        .join("; ")}). Centang "Tetap simpan" untuk melanjutkan, lalu sesuaikan penugasan.`
    );
  }

  await db.update(personnel).set({ cycleStartDate: start }).where(inArray(personnel.id, ids));
  if (clearManual) {
    await db.delete(rosterOverrides).where(and(inArray(rosterOverrides.personnelId, ids), gte(rosterOverrides.date, start)));
  }
  await logAudit(admin, "GENERATE", "Roster", {
    detail: `Roster otomatis ${people.length} personel, mulai ${start}${clearManual ? " (override manual dihapus)" : ""}`,
  });
  await notifyPersonnel(ids, {
    type: "ROSTER_CHANGED",
    title: "Roster diperbarui",
    message: `Roster Anda diperbarui dengan siklus baru mulai ${formatDate(start)}. Periksa menu Roster Saya.`,
  });
  if (conflicts.length) {
    await notifyAdmins({
      type: "ASSIGNMENT_CONFLICT",
      title: "Benturan penugasan setelah perubahan roster",
      message: `${conflicts.length} penugasan perlu disesuaikan setelah roster diperbarui.`,
      link: `/admin/penugasan?date=${conflicts[0].date}`,
    });
  }
  revalidatePath("/admin/roster");
  return ok(`Roster ${people.length} personel berhasil dibuat mulai ${formatDate(start)}.${conflicts.length ? ` ${conflicts.length} penugasan perlu disesuaikan.` : ""}`);
}

/** Ubah jadwal manual untuk rentang tanggal. code = P | M | L | AUTO (kembalikan ke pola otomatis). */
export async function manualRoster(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const ids = fd.getAll("personIds").map(String);
  const start = str(fd, "start");
  const end = str(fd, "end") || start;
  const code = str(fd, "code");
  const note = optStr(fd, "note");
  const force = fd.get("force") === "on";
  if (!ids.length) return fail("Pilih personel.");
  if (!isValidDate(start) || !isValidDate(end) || end < start) return fail("Rentang tanggal tidak valid.");
  if (!["P", "M", "L", "AUTO"].includes(code)) return fail("Jenis jadwal tidak valid.");
  const days = rangeDays(start, end);
  if (days.length > 62) return fail("Maksimal 62 hari per perubahan.");

  const people = await db.query.personnel.findMany({ where: inArray(personnel.id, ids) });
  const ctx = await loadRosterContext(ids);
  // Tidak boleh mengubah hari yang sedang cuti periodik
  for (const p of people) {
    const onLeave = days.filter((d) => rosterCode(p, ctx, d) === "C");
    if (onLeave.length && code !== "AUTO") {
      return fail(`${p.name} sedang cuti periodik pada ${formatDate(onLeave[0])}. Ubah jadwal cuti terlebih dahulu.`);
    }
  }
  if (code !== "AUTO") {
    const conflicts = await assignmentConflicts(ids, start, end, () => code);
    if (conflicts.length && !force) {
      return fail(`Benturan: ${conflicts.map((c) => `${c.name} punya penugasan ${c.shift} ${formatDate(c.date, { short: true })}`).slice(0, 3).join("; ")}. Centang "Tetap simpan" untuk melanjutkan.`);
    }
  }

  await db.delete(rosterOverrides).where(and(inArray(rosterOverrides.personnelId, ids), gte(rosterOverrides.date, start), lte(rosterOverrides.date, end)));
  if (code !== "AUTO") {
    const rows = ids.flatMap((pid) => days.map((date) => ({ personnelId: pid, date, code, note, createdBy: admin.name })));
    await db.insert(rosterOverrides).values(rows);
  }
  const label = { P: "Shift Pagi", M: "Shift Malam", L: "Libur", AUTO: "pola otomatis" }[code];
  await logAudit(admin, "MANUAL", "Roster", { detail: `${people.map((p) => p.name).join(", ")}: ${start} s.d. ${end} → ${label}`, reason: note });
  await notifyPersonnel(ids, {
    type: "ROSTER_CHANGED",
    title: "Perubahan roster",
    message: `Jadwal Anda ${formatDate(start)}${end !== start ? ` s.d. ${formatDate(end)}` : ""} diubah menjadi ${label}.`,
  });
  revalidatePath("/admin/roster");
  return ok(`Jadwal ${people.length} personel diperbarui (${days.length} hari → ${label}).`);
}

// ───────────── Template shift & jam kerja khusus ─────────────

export async function saveShiftConfig(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const code = str(fd, "code") as "PAGI" | "MALAM";
  const t = { startTime: str(fd, "startTime"), endTime: str(fd, "endTime"), breakStart: str(fd, "breakStart"), breakEnd: str(fd, "breakEnd") };
  if (!["PAGI", "MALAM"].includes(code)) return fail("Shift tidak valid.");
  if (!Object.values(t).every(isValidTime)) return fail("Format jam harus HH:MM.");
  const name = code === "PAGI" ? "Shift 1 — Pagi" : "Shift 2 — Malam";
  await db.insert(shiftConfigs).values({ code, name, ...t }).onConflictDoUpdate({ target: shiftConfigs.code, set: t });
  await logAudit(admin, "UPDATE", "Shift", { detail: `${name}: ${t.startTime}–${t.endTime}, istirahat ${t.breakStart}–${t.breakEnd} (permanen)` });
  await notifyAdmins({ type: "SHIFT_CHANGED", title: "Perubahan jam kerja permanen", message: `${name} kini ${t.startTime}–${t.endTime}, istirahat ${t.breakStart}–${t.breakEnd}.` });
  const all = await db.select({ id: personnel.id }).from(personnel);
  await notifyPersonnel(all.map((p) => p.id), { type: "SHIFT_CHANGED", title: "Perubahan jam kerja", message: `${name} berlaku jam ${t.startTime}–${t.endTime}, istirahat ${t.breakStart}–${t.breakEnd}.` });
  revalidatePath("/admin", "layout");
  return ok(`${name} disimpan.`);
}

export async function addShiftOverride(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const date = str(fd, "date");
  const shifts = fd.getAll("shift").map(String).filter((s) => s === "PAGI" || s === "MALAM") as ("PAGI" | "MALAM")[];
  const pitId = optStr(fd, "pitId");
  const reason = str(fd, "reason");
  const t = { startTime: str(fd, "startTime"), endTime: str(fd, "endTime"), breakStart: str(fd, "breakStart"), breakEnd: str(fd, "breakEnd") };
  if (!isValidDate(date)) return fail("Tanggal tidak valid.");
  if (!shifts.length) return fail("Pilih minimal satu shift.");
  if (!Object.values(t).every(isValidTime)) return fail("Format jam harus HH:MM.");
  if (reason.length < 3) return fail("Alasan perubahan wajib diisi.");
  for (const shift of shifts) {
    await db.delete(shiftOverrides).where(and(eq(shiftOverrides.date, date), eq(shiftOverrides.shift, shift), pitId ? eq(shiftOverrides.pitId, pitId) : undefined));
    await db.insert(shiftOverrides).values({ date, shift, pitId, ...t, reason, createdBy: admin.name });
  }
  await logAudit(admin, "OVERRIDE", "Shift", { detail: `${date} ${shifts.join("+")}: ${t.startTime}–${t.endTime}${pitId ? " (PIT tertentu)" : ""}`, reason });
  // Notifikasi admin & personel terdampak (yang roster-nya bekerja pada tanggal & shift tersebut)
  await notifyAdmins({ type: "SHIFT_CHANGED", title: "Perubahan jam kerja khusus", message: `${formatDate(date)} (${shifts.join(", ")}): ${t.startTime}–${t.endTime}. Alasan: ${reason}.` });
  const people = await db.query.personnel.findMany({ where: (p, { ne }) => ne(p.workStatus, "RESIGN") });
  const ctx = await loadRosterContext(people.map((p) => p.id));
  const affected = people
    .filter((p) => !pitId || p.pitId === pitId)
    .filter((p) => {
      const c = rosterCode(p, ctx, date);
      return (c === "P" && shifts.includes("PAGI")) || (c === "M" && shifts.includes("MALAM"));
    })
    .map((p) => p.id);
  await notifyPersonnel(affected, {
    type: "SHIFT_CHANGED",
    title: "Perubahan jam kerja",
    message: `Pada ${formatDate(date)} jam kerja Anda menjadi ${t.startTime}–${t.endTime} (istirahat ${t.breakStart}–${t.breakEnd}). ${reason}.`,
  });
  revalidatePath("/admin/roster/shift");
  return ok(`Jam kerja khusus disimpan. ${affected.length} personel terdampak telah diberi notifikasi.`);
}

export async function deleteShiftOverride(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const [row] = await db.delete(shiftOverrides).where(eq(shiftOverrides.id, id)).returning();
  if (!row) return fail("Data tidak ditemukan.");
  await logAudit(admin, "DELETE", "Shift", { detail: `Jam khusus ${row.date} ${row.shift} dihapus` });
  revalidatePath("/admin/roster/shift");
  return ok("Jam kerja khusus dihapus, kembali ke jam standar.");
}
