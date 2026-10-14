import Link from "next/link";
import { and, count, eq } from "drizzle-orm";
import { LogOut, KeyRound } from "lucide-react";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requirePortalUser } from "@/lib/portal";
import { getSetting } from "@/lib/settings";
import { glTypeLabel } from "@/lib/constants";
import { Logo } from "@/components/logo";
import { PortalNav } from "@/components/portal-nav";
import { logoutAction } from "../login/actions";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePortalUser();
  const landing = await getSetting("landing");
  const [{ unread }] = await db.select({ unread: count() }).from(notifications).where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false)));
  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="sticky top-0 z-30 bg-navy">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4">
          <Link href="/portal"><Logo light src={landing.logo || undefined} subtitle={false} /></Link>
          <div className="flex flex-1 items-center justify-end gap-2 md:justify-between md:pl-6">
            <PortalNav unread={unread} />
          </div>
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-white/10">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">{user.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}</span>
            </summary>
            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-gray-100 bg-white p-1.5 shadow-lg">
              <div className="border-b border-gray-100 px-3 py-2">
                <p className="text-sm font-semibold">{user.name}</p>
                <p className="text-xs text-gray-500">{user.personnel.category === "OPERATOR" ? "Operator" : glTypeLabel(user.personnel.glType)} · {user.employeeNo}</p>
              </div>
              <Link href="/ganti-password" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50"><KeyRound className="h-4 w-4" /> Ganti Password</Link>
              <form action={logoutAction}>
                <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-brand hover:bg-red-50"><LogOut className="h-4 w-4" /> Keluar</button>
              </form>
            </div>
          </details>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
