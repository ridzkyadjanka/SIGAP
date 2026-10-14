import "server-only";
import { redirect } from "next/navigation";
import { requireUser, isAdminRole } from "./auth";

/** Portal hanya untuk Operator & Group Leader; data selalu dibatasi pada personel milik sesi. */
export async function requirePortalUser() {
  const user = await requireUser();
  if (isAdminRole(user.role)) redirect("/admin");
  if (user.mustChangePassword) redirect("/ganti-password");
  if (!user.personnel) redirect("/login");
  return { ...user, personnel: user.personnel };
}
