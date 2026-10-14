import { and, count, desc, gte, ilike, lte, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { PageHeader, Card, Badge, Field, Pagination, Tabs } from "@/components/ui";
import { formatDateTime, isValidDate } from "@/lib/dates";

export const metadata = { title: "Audit Log" };
const PAGE_SIZE = 40;

const TABS = [
  { key: "kerja", label: "Shift & Pola Kerja", href: "/admin/pengaturan" },
  { key: "tampilan", label: "Tampilan Website", href: "/admin/pengaturan/tampilan" },
  { key: "audit", label: "Audit Log", href: "/admin/pengaturan/audit" },
];

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const conds: SQL[] = [];
  if (sp.q) conds.push(or(ilike(auditLogs.detail, `%${sp.q}%`), ilike(auditLogs.actorName, `%${sp.q}%`), ilike(auditLogs.entity, `%${sp.q}%`))!);
  if (isValidDate(sp.from)) conds.push(gte(auditLogs.createdAt, new Date(`${sp.from}T00:00:00+07:00`)));
  if (isValidDate(sp.to)) conds.push(lte(auditLogs.createdAt, new Date(`${sp.to}T23:59:59+07:00`)));
  const where = conds.length ? and(...conds) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(auditLogs).where(where);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const rows = await db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
  return (
    <>
      <PageHeader title="Pengaturan" description="Audit log mencatat siapa, kapan, apa yang diubah, dan alasannya." />
      <Tabs active="audit" items={TABS} />
      <Card>
        <form className="flex flex-col gap-3 border-b border-gray-100 p-4 md:flex-row md:items-end">
          <Field label="Cari" className="flex-1"><input name="q" defaultValue={sp.q} className="input" placeholder="Admin, modul, atau detail…" /></Field>
          <Field label="Dari"><input type="date" name="from" defaultValue={sp.from} className="input" /></Field>
          <Field label="Sampai"><input type="date" name="to" defaultValue={sp.to} className="input" /></Field>
          <button className="btn-navy">Filter</button>
        </form>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Waktu</th><th>Admin</th><th>Aksi</th><th>Modul</th><th>Detail</th><th>Alasan</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-xs text-gray-500">{formatDateTime(r.createdAt)}</td>
                  <td className="whitespace-nowrap font-medium">{r.actorName}</td>
                  <td><Badge tone={r.action.includes("DELETE") || r.action.includes("DEACTIVATE") || r.action.includes("CANCEL") ? "red" : r.action.includes("CREATE") ? "green" : "navy"}>{r.action}</Badge></td>
                  <td className="text-sm">{r.entity}</td>
                  <td className="text-sm text-gray-700">{r.detail}</td>
                  <td className="text-xs text-gray-500">{r.reason ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pages={pages} makeHref={(p) => `/admin/pengaturan/audit?${new URLSearchParams({ ...sp, page: String(p) })}`} />
      </Card>
    </>
  );
}
