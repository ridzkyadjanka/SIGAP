"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accountDeactivations, leaves, personnel, users } from "@/db/schema";
import { requireAdmin, revokeUserSessions } from "@/lib/auth";
import { fail, ok, optStr, str, type ActionResult } from "@/lib/action";
import { addDays, diffDays, formatDate, isValidDate, todayStr } from "@/lib/dates";
import { hasOverlappingLeave } from "@/lib/roster";
import { getSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { notifyPersonnel, runMaintenance } from "@/lib/operations";

const linkNote = (leaveId: string) => `leave:${leaveId}`;

async function syncLeaveDeactivation(leaveId: string, personnelId: string, start: string, end: string, by: string, cancelled = false) {
  const user = await db.query.users.findFirst({ where: eq(users.personnelId, personnelId) });
  if (!user) return;
  const existing = await db.query.accountDeactivations.findFirst({ where: and(eq(accountDeactivations.userId, user.id), eq(accountDeactivations.note, linkNote(leaveId))) });
  if (existing) {
    await db.update(accountDeactivations).set({ startDate: start, endDate: end, cancelled }).where(eq(accountDeactivations.id, existing.id));
  } else if (!cancelled) {
    await db.insert(accountDeactivations).values({ userId: user.id, reason: "CUTI_PERIODIK", note: linkNote(leaveId), startDate: start, endDate: end, createdBy: by });
  }
  if (!cancelled && start <= todayStr() && todayStr() <= end) await revokeUserSessions(user.id);
}

export async function saveLeave(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = optStr(fd, "id");
  const personnelId = str(fd, "personnelId");
  const startDate = str(fd, "startDate");
  const rules = await getSetting("leave_rules");
  const endDate = str(fd, "endDate") || (isValidDate(startDate) ? addDays(startDate, rules.durationDays - 1) : "");
  const note = optStr(fd, "note");
  if (!isValidDate(startDate) || !isValidDate(endDate) || endDate < startDate) return fail("Periode cuti tidak valid.");
  if (diffDays(startDate, endDate) > 60) return fail("Periode cuti maksimal 60 hari.");
  const p = await db.query.personnel.findFirst({ where: eq(personnel.id, personnelId) });
  if (!p) return fail("Personel tidak ditemukan.");
  if (p.workStatus === "RESIGN") return fail("Personel sudah resign.");
  if (await hasOverlappingLeave(personnelId, startDate, endDate, id ?? undefined)) return fail("Periode beririsan dengan cuti lain milik personel ini.");

  const today = todayStr();
  const status = endDate < today ? "SELESAI" : startDate <= today ? "BERLANGSUNG" : "DIJADWALKAN";
  let leaveId = id;
  if (id) {
    const before = await db.query.leaves.findFirst({ where: eq(leaves.id, id) });
    if (!before) return fail("Data cuti tidak ditemukan.");
    await db.update(leaves).set({ startDate, endDate, note, status }).where(eq(leaves.id, id));
    await logAudit(admin, "RESCHEDULE", "Cuti", { entityId: id, detail: `${p.name}: ${before.startDate}–${before.endDate} → ${startDate}–${endDate}`, reason: note });
    await notifyPersonnel([p.id], { type: "LEAVE", title: "Jadwal cuti diubah", message: `Cuti periodik Anda dijadwalkan ulang: ${formatDate(startDate)} – ${formatDate(endDate)}.` });
  } else {
    const [row] = await db.insert(leaves).values({ personnelId, startDate, endDate, note, status, createdBy: admin.name }).returning();
    leaveId = row.id;
    await logAudit(admin, "CREATE", "Cuti", { entityId: row.id, detail: `${p.name}: ${startDate} – ${endDate}` });
    await notifyPersonnel([p.id], { type: "LEAVE", title: "Cuti periodik ditetapkan", message: `Cuti periodik Anda: ${formatDate(startDate)} – ${formatDate(endDate)}. Akun dinonaktifkan selama cuti.` });
  }
  if (status === "BERLANGSUNG" && p.workStatus === "AKTIF") await db.update(personnel).set({ workStatus: "CUTI" }).where(eq(personnel.id, p.id));
  await syncLeaveDeactivation(leaveId!, p.id, startDate, endDate, admin.name);
  await runMaintenance(true);
  revalidatePath("/admin", "layout");
  return ok(id ? "Jadwal cuti diperbarui." : `Cuti ${p.name} ditetapkan ${formatDate(startDate)} – ${formatDate(endDate)}.`);
}

export async function cancelLeave(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const l = await db.query.leaves.findFirst({ where: eq(leaves.id, id), with: { personnel: true } });
  if (!l) return fail("Data cuti tidak ditemukan.");
  await db.update(leaves).set({ status: "DIBATALKAN" }).where(eq(leaves.id, id));
  if (l.personnel.workStatus === "CUTI") await db.update(personnel).set({ workStatus: "AKTIF" }).where(eq(personnel.id, l.personnelId));
  await syncLeaveDeactivation(id, l.personnelId, l.startDate, l.endDate, admin.name, true);
  await logAudit(admin, "CANCEL", "Cuti", { entityId: id, detail: `${l.personnel.name}: ${l.startDate} – ${l.endDate}`, reason: optStr(fd, "reason") });
  await notifyPersonnel([l.personnelId], { type: "LEAVE", title: "Cuti dibatalkan", message: `Cuti periodik ${formatDate(l.startDate)} – ${formatDate(l.endDate)} dibatalkan. Akun Anda aktif kembali.` });
  revalidatePath("/admin", "layout");
  return ok("Cuti dibatalkan dan akun diaktifkan kembali.");
}

/** Akhiri cuti lebih awal: personel kembali bekerja mulai besok. */
export async function endLeaveEarly(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const l = await db.query.leaves.findFirst({ where: eq(leaves.id, id), with: { personnel: true } });
  if (!l) return fail("Data cuti tidak ditemukan.");
  const today = todayStr();
  await db.update(leaves).set({ endDate: today, status: "BERLANGSUNG" }).where(eq(leaves.id, id));
  await syncLeaveDeactivation(id, l.personnelId, l.startDate, today, admin.name);
  await logAudit(admin, "END_EARLY", "Cuti", { entityId: id, detail: `${l.personnel.name} kembali bekerja mulai ${addDays(today, 1)}` });
  revalidatePath("/admin", "layout");
  return ok(`Cuti ${l.personnel.name} berakhir hari ini. Siklus roster dimulai ulang besok.`);
}

// ───────────── Status kehadiran (sakit / aktif) ─────────────

export async function markSick(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const personnelId = str(fd, "personnelId");
  const start = str(fd, "start");
  const end = str(fd, "end");
  const note = optStr(fd, "note");
  if (!isValidDate(start) || !isValidDate(end) || end < start) return fail("Periode tidak valid.");
  const p = await db.query.personnel.findFirst({ where: eq(personnel.id, personnelId), with: { user: true } });
  if (!p) return fail("Personel tidak ditemukan.");
  const today = todayStr();
  if (start <= today && today <= end) await db.update(personnel).set({ workStatus: "SAKIT" }).where(eq(personnel.id, p.id));
  if (p.user) {
    await db.insert(accountDeactivations).values({ userId: p.user.id, reason: "SAKIT", note, startDate: start, endDate: end, createdBy: admin.name });
    if (start <= today) await revokeUserSessions(p.user.id);
  }
  await logAudit(admin, "SICK", "Kehadiran", { entityId: p.id, detail: `${p.name} sakit ${start} – ${end}`, reason: note });
  await runMaintenance(true);
  revalidatePath("/admin", "layout");
  return ok(`${p.name} ditandai sakit ${formatDate(start)} – ${formatDate(end)}. Akun diblokir sementara.`);
}

export async function markActive(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const personnelId = str(fd, "personnelId");
  const p = await db.query.personnel.findFirst({ where: eq(personnel.id, personnelId), with: { user: true } });
  if (!p) return fail("Personel tidak ditemukan.");
  if (p.workStatus === "CUTI") return fail("Personel sedang cuti periodik. Gunakan menu Cuti Periodik untuk mengakhiri cuti.");
  await db.update(personnel).set({ workStatus: "AKTIF" }).where(eq(personnel.id, p.id));
  if (p.user) {
    await db.update(accountDeactivations).set({ cancelled: true }).where(and(eq(accountDeactivations.userId, p.user.id), eq(accountDeactivations.reason, "SAKIT"), eq(accountDeactivations.cancelled, false)));
  }
  await logAudit(admin, "ACTIVE", "Kehadiran", { entityId: p.id, detail: `${p.name} kembali aktif` });
  revalidatePath("/admin", "layout");
  return ok(`${p.name} kembali aktif.`);
}
