import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requirePortalUser } from "@/lib/portal";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/components/ui";

export const metadata = { title: "Informasi" };

export default async function PortalNotifications() {
  const user = await requirePortalUser();
  const rows = await db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(100);
  // Membuka halaman ini menandai seluruh informasi sebagai sudah dibaca
  await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false)));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Informasi</h1>
      <div className="card">
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400">Belum ada informasi.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((n) => (
              <li key={n.id} className={cn("px-5 py-4", !n.isRead && "bg-brand-light/30")}>
                <p className={cn("text-sm", !n.isRead && "font-bold")}>{n.title}</p>
                <p className="text-sm text-gray-600">{n.message}</p>
                <p className="mt-1 text-xs text-gray-400">{formatDateTime(n.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
