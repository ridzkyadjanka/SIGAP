import Link from "next/link";
import { Suspense } from "react";
import { Bell, LogOut, KeyRound } from "lucide-react";
import { and, count, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { runMaintenance } from "@/lib/operations";
import { getSetting } from "@/lib/settings";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDate, todayStr } from "@/lib/dates";
import { Sidebar } from "@/components/admin/sidebar";
import { logoutAction } from "../login/actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  await runMaintenance();
  const [{ unread }] = await db
    .select({ unread: count() })
    .from(notifications)
    .where(and(eq(notifications.forAdmin, true), eq(notifications.isRead, false)));
  const landing = await getSetting("landing");

  return (
    <div className="min-h-screen">
      <Suspense>
        <Sidebar logo={landing.logo || undefined} />
      </Suspense>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-gray-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <div className="flex-1 pl-10 lg:pl-0">
            <p className="text-xs font-medium text-gray-500">{formatDate(todayStr(), { withDay: true })}</p>
          </div>
          <Link href="/admin/notifikasi" className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-navy" aria-label="Notifikasi">
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-100">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">
                {user.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-semibold leading-tight text-navy">{user.name}</span>
                <span className="block text-[11px] text-gray-500">{ROLE_LABELS[user.role]}</span>
              </span>
            </summary>
            <div className="absolute right-0 mt-2 w-52 rounded-xl border border-gray-100 bg-white p-1.5 shadow-lg">
              <Link href="/ganti-password" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-navy hover:bg-gray-50">
                <KeyRound className="h-4 w-4" /> Ganti Password
              </Link>
              <form action={logoutAction}>
                <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-brand hover:bg-red-50">
                  <LogOut className="h-4 w-4" /> Keluar
                </button>
              </form>
            </div>
          </details>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
