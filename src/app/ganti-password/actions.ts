"use server";

import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { getCurrentUser, hashPassword, homeFor, SESSION_COOKIE, validateNewPassword, verifyPassword } from "@/lib/auth";
import { fail, str, type ActionResult } from "@/lib/action";
import { logAudit } from "@/lib/audit";

export async function changePasswordAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const current = str(fd, "current");
  const next = str(fd, "next");
  const confirm = str(fd, "confirm");
  const user = await db.query.users.findFirst({ where: eq(users.id, me.id) });
  if (!user || !(await verifyPassword(current, user.passwordHash))) return fail("Password saat ini salah.");
  if (next !== confirm) return fail("Konfirmasi password tidak sama.");
  if (next === current) return fail("Password baru harus berbeda dari password saat ini.");
  const err = validateNewPassword(next, me.personnel?.birthDate);
  if (err) return fail(err);

  await db.update(users).set({ passwordHash: await hashPassword(next), mustChangePassword: false }).where(eq(users.id, me.id));
  // Cabut sesi lain milik user, pertahankan sesi saat ini
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  const th = createHash("sha256").update(token).digest("hex");
  await db.delete(sessions).where(and(eq(sessions.userId, me.id), ne(sessions.tokenHash, th)));
  await logAudit({ id: me.id, name: me.name }, "CHANGE_PASSWORD", "Akun", { entityId: me.id, detail: "Password diganti oleh pengguna" });
  redirect(homeFor(me.role));
}
