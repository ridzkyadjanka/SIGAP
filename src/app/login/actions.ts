"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { canLogin, createSession, destroyCurrentSession, homeFor, verifyPassword, type Role } from "@/lib/auth";
import { fail, str, type ActionResult } from "@/lib/action";
import { getSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";

// Pembatasan percobaan per alamat IP (in-memory) — lapisan tambahan di atas penguncian per akun
const ipAttempts = new Map<string, { count: number; until: number }>();
const IP_LIMIT = 30;
const IP_WINDOW = 15 * 60 * 1000;

export async function loginAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const employeeNo = str(fd, "employeeNo").toUpperCase();
  const password = str(fd, "password");
  if (!employeeNo || !password) return fail("Nomor pegawai dan password wajib diisi.");

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rec = ipAttempts.get(ip);
  if (rec && rec.until > Date.now() && rec.count >= IP_LIMIT) {
    return fail("Terlalu banyak percobaan login dari perangkat ini. Coba lagi dalam 15 menit.");
  }

  const policy = await getSetting("login_policy");
  const user = await db.query.users.findFirst({ where: eq(users.employeeNo, employeeNo), with: { personnel: true } });
  const generic = fail("Nomor pegawai atau password salah.");

  const bumpIp = () => {
    const r = ipAttempts.get(ip);
    if (!r || r.until < Date.now()) ipAttempts.set(ip, { count: 1, until: Date.now() + IP_WINDOW });
    else r.count++;
  };

  if (!user) {
    bumpIp();
    return generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return fail(`Akun terkunci sementara karena terlalu banyak percobaan gagal. Coba lagi dalam ${mins} menit.`);
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    bumpIp();
    const failed = user.failedLogins + 1;
    const lock = failed >= policy.maxAttempts;
    await db
      .update(users)
      .set({
        failedLogins: lock ? 0 : failed,
        lockedUntil: lock ? new Date(Date.now() + policy.lockMinutes * 60000) : null,
      })
      .where(eq(users.id, user.id));
    if (lock) {
      await logAudit(null, "LOGIN_LOCKED", "Akun", { entityId: user.id, detail: `${user.employeeNo} terkunci ${policy.lockMinutes} menit` });
      return fail(`Akun dikunci ${policy.lockMinutes} menit karena ${policy.maxAttempts}x percobaan gagal.`);
    }
    return fail(`Nomor pegawai atau password salah. Sisa percobaan: ${policy.maxAttempts - failed}.`);
  }
  if (user.isArchived) return fail("Akun telah diarsipkan (resign). Hubungi administrator.");
  if (!(await canLogin(user))) return fail("Akun Anda sedang nonaktif (sakit, cuti periodik, atau administratif). Hubungi administrator.");

  await db.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await createSession(user.id);
  redirect(user.mustChangePassword ? "/ganti-password" : homeFor(user.role as Role));
}

export async function logoutAction() {
  await destroyCurrentSession();
  redirect("/login");
}
