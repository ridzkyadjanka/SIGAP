"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accountDeactivations, personnel, users } from "@/db/schema";
import { hashPassword, requireAdmin, revokeUserSessions, validateNewPassword, type CurrentUser } from "@/lib/auth";
import { fail, ok, optStr, str, type ActionResult } from "@/lib/action";
import { birthDatePassword, formatDate, isValidDate, todayStr } from "@/lib/dates";
import { logAudit } from "@/lib/audit";
import { DEACTIVATION_REASONS, deactivationLabel } from "@/lib/constants";

async function loadTarget(admin: CurrentUser, id: string) {
  const u = await db.query.users.findFirst({ where: eq(users.id, id), with: { personnel: true } });
  if (!u) return { error: fail("Akun tidak ditemukan.") };
  const isAdminAcc = u.role === "SUPER_ADMIN" || u.role === "ADMIN_MANPOWER";
  if (isAdminAcc && admin.role !== "SUPER_ADMIN") return { error: fail("Hanya Super Admin yang dapat mengelola akun administrator.") };
  return { u };
}

const label = (u: { employeeNo: string; displayName: string | null; personnel?: { name: string } | null }) => `${u.personnel?.name ?? u.displayName ?? ""} (${u.employeeNo})`;

export async function createAccount(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const mode = str(fd, "mode");
  if (mode === "personnel") {
    const pid = str(fd, "personnelId");
    const p = await db.query.personnel.findFirst({ where: eq(personnel.id, pid), with: { user: true } });
    if (!p) return fail("Pilih personel.");
    if (p.user) return fail("Personel ini sudah memiliki akun.");
    const dup = await db.query.users.findFirst({ where: eq(users.employeeNo, p.employeeNo) });
    if (dup) return fail("Nomor pegawai sudah terhubung dengan akun lain.");
    await db.insert(users).values({ employeeNo: p.employeeNo, passwordHash: await hashPassword(birthDatePassword(p.birthDate)), role: p.category === "OPERATOR" ? "OPERATOR" : "GROUP_LEADER", personnelId: p.id, mustChangePassword: true });
    await logAudit(admin, "CREATE", "Akun", { detail: `Akun ${p.name} (${p.employeeNo}) dibuat` });
    revalidatePath("/admin/users");
    return ok(`Akun ${p.name} dibuat. Password awal: tanggal lahir (DDMMYYYY).`);
  }
  // Akun administrator
  if (admin.role !== "SUPER_ADMIN") return fail("Hanya Super Admin yang dapat membuat akun administrator.");
  const employeeNo = str(fd, "employeeNo").toUpperCase();
  const displayName = str(fd, "displayName");
  const role = str(fd, "role") === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN_MANPOWER";
  const password = str(fd, "password");
  if (!/^[A-Z0-9-]{3,20}$/.test(employeeNo)) return fail("Nomor pegawai tidak valid.");
  if (displayName.length < 3) return fail("Nama wajib diisi.");
  const err = validateNewPassword(password);
  if (err) return fail(err);
  if (await db.query.users.findFirst({ where: eq(users.employeeNo, employeeNo) })) return fail("Nomor pegawai sudah terdaftar.");
  await db.insert(users).values({ employeeNo, displayName, role, passwordHash: await hashPassword(password), mustChangePassword: true });
  await logAudit(admin, "CREATE", "Akun", { detail: `Akun admin ${displayName} (${employeeNo}) — ${role}` });
  revalidatePath("/admin/users");
  return ok("Akun administrator dibuat. Pengguna wajib mengganti password saat login pertama.");
}

export async function resetPassword(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { u, error } = await loadTarget(admin, str(fd, "id"));
  if (!u) return error;
  let pw: string;
  if (u.personnel) pw = birthDatePassword(u.personnel.birthDate);
  else {
    pw = str(fd, "password");
    const err = validateNewPassword(pw);
    if (err) return fail(err);
  }
  await db.update(users).set({ passwordHash: await hashPassword(pw), mustChangePassword: true, failedLogins: 0, lockedUntil: null }).where(eq(users.id, u.id));
  await revokeUserSessions(u.id);
  await logAudit(admin, "RESET_PASSWORD", "Akun", { entityId: u.id, detail: label(u), reason: optStr(fd, "reason") });
  revalidatePath("/admin/users");
  return ok(u.personnel ? "Password direset ke tanggal lahir (DDMMYYYY). Wajib diganti saat login." : "Password sementara disimpan. Wajib diganti saat login.");
}

export async function setAccountActive(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { u, error } = await loadTarget(admin, str(fd, "id"));
  if (!u) return error;
  if (u.id === admin.id) return fail("Anda tidak dapat menonaktifkan akun sendiri.");
  const activate = str(fd, "activate") === "1";
  if (activate) {
    if (u.personnel?.workStatus === "RESIGN") return fail("Akun personel resign tidak dapat diaktifkan.");
    await db.update(users).set({ isActive: true, isArchived: false, failedLogins: 0, lockedUntil: null }).where(eq(users.id, u.id));
    // batalkan penonaktifan terjadwal yang sedang berlaku
    const today = todayStr();
    const active = await db.query.accountDeactivations.findMany({ where: eq(accountDeactivations.userId, u.id) });
    for (const d of active.filter((d) => !d.cancelled && d.startDate <= today && (!d.endDate || d.endDate >= today))) {
      await db.update(accountDeactivations).set({ cancelled: true }).where(eq(accountDeactivations.id, d.id));
    }
    await logAudit(admin, "ACTIVATE", "Akun", { entityId: u.id, detail: `${label(u)} diaktifkan`, reason: optStr(fd, "reason") });
    revalidatePath("/admin/users");
    return ok("Akun diaktifkan.");
  }
  const reason = str(fd, "reason") as (typeof DEACTIVATION_REASONS)[number]["value"];
  if (!DEACTIVATION_REASONS.some((r) => r.value === reason)) return fail("Pilih alasan penonaktifan.");
  const start = str(fd, "start") || todayStr();
  const end = optStr(fd, "end");
  const note = optStr(fd, "note");
  if (!isValidDate(start) || (end && (!isValidDate(end) || end < start))) return fail("Tanggal penonaktifan tidak valid.");

  if (reason === "RESIGN") {
    await db.update(users).set({ isActive: false, isArchived: true }).where(eq(users.id, u.id));
    if (u.personnelId) await db.update(personnel).set({ workStatus: "RESIGN" }).where(eq(personnel.id, u.personnelId));
    await db.insert(accountDeactivations).values({ userId: u.id, reason, note, startDate: start, createdBy: admin.name });
    await revokeUserSessions(u.id);
  } else {
    await db.insert(accountDeactivations).values({ userId: u.id, reason, note, startDate: start, endDate: end, createdBy: admin.name });
    if (!end && start <= todayStr()) await db.update(users).set({ isActive: false }).where(eq(users.id, u.id));
    if (start <= todayStr()) await revokeUserSessions(u.id);
    if (reason === "SAKIT" && u.personnelId && start <= todayStr()) await db.update(personnel).set({ workStatus: "SAKIT" }).where(eq(personnel.id, u.personnelId));
  }
  await logAudit(admin, "DEACTIVATE", "Akun", {
    entityId: u.id,
    detail: `${label(u)} dinonaktifkan (${deactivationLabel(reason)}) ${formatDate(start)}${end ? ` s.d. ${formatDate(end)}` : ""}`,
    reason: note ?? deactivationLabel(reason),
  });
  revalidatePath("/admin/users");
  return ok(reason === "RESIGN" ? "Akun diarsipkan (resign). Histori tetap tersimpan." : `Penonaktifan dijadwalkan ${formatDate(start)}${end ? ` – ${formatDate(end)}` : " (tanpa batas)"}.`);
}

export async function cancelDeactivation(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const d = await db.query.accountDeactivations.findFirst({ where: eq(accountDeactivations.id, id), with: { user: { with: { personnel: true } } } });
  if (!d) return fail("Data tidak ditemukan.");
  const { error } = await loadTarget(admin, d.userId);
  if (error) return error;
  await db.update(accountDeactivations).set({ cancelled: true }).where(eq(accountDeactivations.id, id));
  await logAudit(admin, "CANCEL_DEACTIVATION", "Akun", { entityId: d.userId, detail: `${label(d.user)}: ${deactivationLabel(d.reason)} dibatalkan` });
  revalidatePath("/admin/users");
  return ok("Penonaktifan dibatalkan.");
}

export async function changeRole(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (admin.role !== "SUPER_ADMIN") return fail("Hanya Super Admin yang dapat mengubah role.");
  const { u, error } = await loadTarget(admin, str(fd, "id"));
  if (!u) return error;
  if (u.personnelId) return fail("Role personel mengikuti kategori (Operator / Group Leader).");
  if (u.id === admin.id) return fail("Tidak dapat mengubah role akun sendiri.");
  const role = str(fd, "role") === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN_MANPOWER";
  await db.update(users).set({ role }).where(eq(users.id, u.id));
  await revokeUserSessions(u.id);
  await logAudit(admin, "CHANGE_ROLE", "Akun", { entityId: u.id, detail: `${label(u)} → ${role}` });
  revalidatePath("/admin/users");
  return ok("Role diperbarui.");
}
