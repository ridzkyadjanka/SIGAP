import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { accountDeactivations, sessions } from "@/db/schema";
import { todayStr } from "./dates";

export const SESSION_COOKIE = "sigap_session";
const TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 12);

export type Role = "SUPER_ADMIN" | "ADMIN_MANPOWER" | "GROUP_LEADER" | "OPERATOR";

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_HOURS * 3600 * 1000);
  const h = await headers();
  const ua = h.get("user-agent")?.slice(0, 200) ?? null;
  // Cookie "Secure" bila diakses lewat HTTPS (langsung atau di balik reverse proxy)
  const https = h.get("x-forwarded-proto") === "https" || process.env.FORCE_SECURE_COOKIES === "true";
  await db.insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt, userAgent: ua });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  jar.delete(SESSION_COOKIE);
}

/** Cabut seluruh sesi aktif milik user (dipakai saat akun dinonaktifkan / password direset). */
export async function revokeUserSessions(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Penonaktifan terjadwal yang berlaku pada tanggal tertentu. */
export async function activeDeactivation(userId: string, date = todayStr()) {
  return db.query.accountDeactivations.findFirst({
    where: and(
      eq(accountDeactivations.userId, userId),
      eq(accountDeactivations.cancelled, false),
      lte(accountDeactivations.startDate, date),
      or(isNull(accountDeactivations.endDate), gte(accountDeactivations.endDate, date))
    ),
  });
}

export async function canLogin(user: { id: string; isActive: boolean; isArchived: boolean }) {
  if (!user.isActive || user.isArchived) return false;
  const d = await activeDeactivation(user.id);
  return !d;
}

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.query.sessions.findFirst({
    where: eq(sessions.tokenHash, hashToken(token)),
    with: { user: { with: { personnel: { with: { pit: true } } } } },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }
  const user = session.user;
  if (!(await canLogin(user))) {
    // Akun dinonaktifkan → cabut semua sesi
    await revokeUserSessions(user.id);
    return null;
  }
  return {
    id: user.id,
    employeeNo: user.employeeNo,
    role: user.role as Role,
    name: user.personnel?.name ?? user.displayName ?? user.employeeNo,
    mustChangePassword: user.mustChangePassword,
    personnel: user.personnel,
  };
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export function isAdminRole(role: Role) {
  return role === "SUPER_ADMIN" || role === "ADMIN_MANPOWER";
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Wajib admin. Dipakai di layout, halaman, DAN setiap server action (validasi backend). */
export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdminRole(user.role)) redirect("/portal");
  if (user.mustChangePassword) redirect("/ganti-password");
  return user;
}

export async function requireSuperAdmin() {
  const user = await requireAdmin();
  if (user.role !== "SUPER_ADMIN") throw new Error("Hanya Super Admin yang dapat melakukan tindakan ini.");
  return user;
}

export function homeFor(role: Role) {
  return isAdminRole(role) ? "/admin" : "/portal";
}

export function validateNewPassword(pw: string, birthDate?: string | null): string | null {
  if (pw.length < 8) return "Password minimal 8 karakter.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Password harus mengandung huruf dan angka.";
  if (birthDate) {
    const [y, m, d] = birthDate.split("-");
    if (pw === `${d}${m}${y}`) return "Password baru tidak boleh sama dengan tanggal lahir.";
  }
  return null;
}

