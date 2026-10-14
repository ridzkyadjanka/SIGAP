import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { BellRing, CheckCheck, RefreshCw, ArrowRight } from "lucide-react";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { PageHeader, Card, Badge, EmptyState, cn } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { formatDateTime } from "@/lib/dates";
import { markRead, refreshNotifications } from "./actions";

export const metadata = { title: "Notification Center" };

const TYPES: Record<string, { label: string; tone: "red" | "orange" | "blue" | "navy" | "gray" | "green" }> = {
  LEAVE_URGENT: { label: "Cuti mendesak", tone: "red" },
  LEAVE_UPCOMING: { label: "Cuti periodik mendatang", tone: "orange" },
  OPERATOR_UNAVAILABLE: { label: "Operator tidak tersedia", tone: "red" },
  MANPOWER_SHORTAGE: { label: "Kekurangan manpower", tone: "red" },
  UNIT_NO_OPERATOR: { label: "Unit tanpa operator", tone: "orange" },
  ASSIGNMENT_CONFLICT: { label: "Benturan penugasan", tone: "red" },
  SHIFT_CHANGED: { label: "Perubahan jam kerja", tone: "blue" },
};

export default async function NotificationPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const filter = sp.filter ?? "unread";
  let rows = await db.select().from(notifications).where(filter === "unread" ? and(eq(notifications.forAdmin, true), eq(notifications.isRead, false)) : eq(notifications.forAdmin, true)).orderBy(desc(notifications.createdAt)).limit(200);
  if (sp.type) rows = rows.filter((r) => r.type === sp.type);
  return (
    <>
      <PageHeader
        title="Notification Center"
        description="Cuti periodik mendatang, operator tidak tersedia, kekurangan manpower, unit tanpa operator, benturan penugasan, dan perubahan jam kerja."
        actions={
          <>
            <ActionForm action={refreshNotifications} showMessage={false}><SubmitButton className="btn-outline" pendingText="Memeriksa…"><RefreshCw className="h-4 w-4" /> Periksa Ulang</SubmitButton></ActionForm>
            <ActionForm action={markRead} showMessage={false}><SubmitButton className="btn-navy" pendingText="…"><CheckCheck className="h-4 w-4" /> Tandai semua dibaca</SubmitButton></ActionForm>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {[["unread", "Belum dibaca"], ["all", "Semua"]].map(([k, l]) => (
          <Link key={k} href={`/admin/notifikasi?filter=${k}`} className={cn("rounded-full px-4 py-1.5 text-sm font-semibold", filter === k ? "bg-navy text-white" : "bg-white text-gray-600 ring-1 ring-gray-200")}>{l}</Link>
        ))}
        <span className="mx-2 border-l border-gray-200" />
        {Object.entries(TYPES).map(([k, v]) => (
          <Link key={k} href={`/admin/notifikasi?filter=${filter}${sp.type === k ? "" : `&type=${k}`}`} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", sp.type === k ? "bg-brand text-white" : "bg-white text-gray-600 ring-1 ring-gray-200")}>{v.label}</Link>
        ))}
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="Tidak ada notifikasi" description="Semua notifikasi sudah dibaca." />
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((n) => {
              const t = TYPES[n.type] ?? { label: n.type, tone: "gray" as const };
              return (
                <li key={n.id} className={cn("flex gap-4 px-5 py-4", !n.isRead && "bg-brand-light/30")}>
                  <BellRing className={cn("mt-0.5 h-5 w-5 shrink-0", t.tone === "red" ? "text-brand" : "text-gray-400")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{n.title}</p>
                      <Badge tone={t.tone}>{t.label}</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-gray-600">{n.message}</p>
                    <p className="mt-1 text-xs text-gray-400">{formatDateTime(n.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-start gap-1">
                    {n.link && <Link href={n.link} className="btn-outline btn-sm">Tindak lanjut <ArrowRight className="h-3.5 w-3.5" /></Link>}
                    {!n.isRead && (
                      <ActionForm action={markRead} showMessage={false}>
                        <input type="hidden" name="id" value={n.id} />
                        <SubmitButton className="btn-ghost btn-sm" pendingText="…">Dibaca</SubmitButton>
                      </ActionForm>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
