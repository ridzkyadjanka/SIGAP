"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { personnel, users, pits } from "@/db/schema";
import { hashPassword, requireAdmin, revokeUserSessions } from "@/lib/auth";
import { dbError, fail, ok, optStr, str, type ActionResult } from "@/lib/action";
import { birthDatePassword, isValidDate, todayStr } from "@/lib/dates";
import { logAudit } from "@/lib/audit";
import { GL_TYPES, UNIT_CATEGORIES } from "@/lib/constants";

const STATUSES = ["AKTIF", "SAKIT", "CUTI", "RESIGN"] as const;

export async function savePersonnel(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = optStr(fd, "id");
  const category: "OPERATOR" | "GROUP_LEADER" = str(fd, "category") === "GROUP_LEADER" ? "GROUP_LEADER" : "OPERATOR";
  const employeeNo = str(fd, "employeeNo").toUpperCase();
  const name = str(fd, "name");
  const birthDate = str(fd, "birthDate");
  const joinDate = str(fd, "joinDate");
  const cycleStartDate = str(fd, "cycleStartDate");
  const phone = optStr(fd, "phone");
  const pitId = optStr(fd, "pitId");
  const workStatus = str(fd, "workStatus") || "AKTIF";
  const glType = optStr(fd, "glType");
  const skills = fd.getAll("skills").map(String).filter((s) => UNIT_CATEGORIES.some((c) => c.value === s));

  if (!/^[A-Z0-9-]{3,20}$/.test(employeeNo)) return fail("Nomor pegawai 3–20 karakter (huruf, angka, tanda -).");
  if (name.length < 3) return fail("Nama lengkap wajib diisi.");
  if (!isValidDate(birthDate)) return fail("Tanggal lahir tidak valid.");
  if (!isValidDate(joinDate)) return fail("Tanggal bergabung tidak valid.");
  if (!isValidDate(cycleStartDate)) return fail("Tanggal mulai siklus tidak valid.");
  if (!STATUSES.includes(workStatus as (typeof STATUSES)[number])) return fail("Status kerja tidak valid.");
  if (category === "OPERATOR" && skills.length === 0) return fail("Pilih minimal satu skill unit.");
  if (category === "GROUP_LEADER" && !GL_TYPES.some((g) => g.value === glType)) return fail("Pilih jenis Group Leader.");
  if (pitId && !(await db.query.pits.findFirst({ where: eq(pits.id, pitId) }))) return fail("Lokasi tidak ditemukan.");

  const values = {
    employeeNo,
    name,
    birthDate,
    joinDate,
    cycleStartDate,
    phone,
    pitId,
    category,
    workStatus: workStatus as (typeof STATUSES)[number],
    position: category === "OPERATOR" ? "Operator" : GL_TYPES.find((g) => g.value === glType)!.label,
    glType: category === "GROUP_LEADER" ? (glType as (typeof GL_TYPES)[number]["value"]) : null,
    skills: category === "OPERATOR" ? skills : [],
  };

  try {
    if (id) {
      const before = await db.query.personnel.findFirst({ where: eq(personnel.id, id), with: { user: true } });
      if (!before) return fail("Data tidak ditemukan.");
      await db.update(personnel).set(values).where(eq(personnel.id, id));
      if (before.user && before.employeeNo !== employeeNo) {
        await db.update(users).set({ employeeNo }).where(eq(users.id, before.user.id));
      }
      if (values.workStatus === "RESIGN" && before.workStatus !== "RESIGN" && before.user) {
        await db.update(users).set({ isActive: false, isArchived: true }).where(eq(users.id, before.user.id));
        await revokeUserSessions(before.user.id);
      }
      const moved = before.pitId !== pitId ? " (penempatan dipindahkan)" : "";
      await logAudit(admin, "UPDATE", category === "OPERATOR" ? "Operator" : "Group Leader", {
        entityId: id,
        detail: `${name} (${employeeNo}) diperbarui${moved}`,
      });
    } else {
      const [row] = await db.insert(personnel).values(values).returning();
      if (fd.get("createAccount") === "on") {
        await db.insert(users).values({
          employeeNo,
          passwordHash: await hashPassword(birthDatePassword(birthDate)),
          role: category === "OPERATOR" ? "OPERATOR" : "GROUP_LEADER",
          personnelId: row.id,
          mustChangePassword: true,
        });
      }
      await logAudit(admin, "CREATE", category === "OPERATOR" ? "Operator" : "Group Leader", {
        entityId: row.id,
        detail: `${name} (${employeeNo}) ditambahkan${fd.get("createAccount") === "on" ? " + akun login" : ""}`,
      });
    }
  } catch (e) {
    return dbError(e);
  }
  revalidatePath("/admin/manpower", "layout");
  return ok(id ? "Data berhasil diperbarui." : "Data berhasil ditambahkan. Password awal = tanggal lahir (DDMMYYYY).");
}

export async function setWorkStatus(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const status = str(fd, "status") as (typeof STATUSES)[number];
  if (!STATUSES.includes(status)) return fail("Status tidak valid.");
  const p = await db.query.personnel.findFirst({ where: eq(personnel.id, id), with: { user: true } });
  if (!p) return fail("Data tidak ditemukan.");
  await db.update(personnel).set({ workStatus: status }).where(eq(personnel.id, id));
  if (p.user) {
    if (status === "RESIGN") {
      await db.update(users).set({ isActive: false, isArchived: true }).where(eq(users.id, p.user.id));
      await revokeUserSessions(p.user.id);
    } else if (p.workStatus === "RESIGN") {
      await db.update(users).set({ isArchived: false }).where(eq(users.id, p.user.id));
    }
  }
  await logAudit(admin, "STATUS", p.category === "OPERATOR" ? "Operator" : "Group Leader", {
    entityId: id,
    detail: `${p.name}: status kerja ${p.workStatus} → ${status}`,
    reason: optStr(fd, "reason"),
  });
  revalidatePath("/admin", "layout");
  return ok(`Status ${p.name} diubah menjadi ${status}.`);
}

export async function toggleAccount(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const personnelId = str(fd, "personnelId");
  const p = await db.query.personnel.findFirst({ where: eq(personnel.id, personnelId), with: { user: true } });
  if (!p) return fail("Data tidak ditemukan.");
  if (!p.user) {
    await db.insert(users).values({
      employeeNo: p.employeeNo,
      passwordHash: await hashPassword(birthDatePassword(p.birthDate)),
      role: p.category === "OPERATOR" ? "OPERATOR" : "GROUP_LEADER",
      personnelId: p.id,
      mustChangePassword: true,
    });
    await logAudit(admin, "CREATE", "Akun", { detail: `Akun dibuat untuk ${p.name} (${p.employeeNo})` });
    revalidatePath("/admin", "layout");
    return ok("Akun login dibuat. Password awal = tanggal lahir (DDMMYYYY).");
  }
  const next = !p.user.isActive;
  if (next && p.workStatus === "RESIGN") return fail("Personel resign tidak dapat diaktifkan kembali. Ubah status kerja terlebih dahulu.");
  await db.update(users).set({ isActive: next }).where(eq(users.id, p.user.id));
  if (!next) await revokeUserSessions(p.user.id);
  await logAudit(admin, next ? "ACTIVATE" : "DEACTIVATE", "Akun", {
    entityId: p.user.id,
    detail: `${p.name} (${p.employeeNo}) ${next ? "diaktifkan" : "dinonaktifkan"} pada ${todayStr()}`,
    reason: optStr(fd, "reason"),
  });
  revalidatePath("/admin", "layout");
  return ok(`Akun ${p.name} ${next ? "diaktifkan" : "dinonaktifkan"}.`);
}
