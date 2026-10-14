import { and, desc, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { assignmentHistory } from "@/db/schema";
import { PageHeader, Card, Badge, EmptyState, Field } from "@/components/ui";
import { addDays, formatDate, formatDateTime, isValidDate, todayStr } from "@/lib/dates";
import { SHIFT_SHORT } from "@/lib/constants";

export const metadata = { title: "Riwayat Penugasan" };

const ACTION: Record<string, { label: string; tone: "green" | "orange" | "red" | "blue" | "gray" | "navy" }> = {
  TAMBAH: { label: "Tambah", tone: "blue" },
  UBAH: { label: "Ubah", tone: "navy" },
  QUICK_REPLACEMENT: { label: "Quick Replacement", tone: "orange" },
  HAPUS: { label: "Hapus", tone: "red" },
  PUBLISH: { label: "Publish", tone: "green" },
};

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const from = isValidDate(sp.from) ? sp.from : addDays(todayStr(), -7);
  const to = isValidDate(sp.to) ? sp.to : todayStr();
  let rows = await db.select().from(assignmentHistory).where(and(gte(assignmentHistory.date, from), lte(assignmentHistory.date, to))).orderBy(desc(assignmentHistory.createdAt)).limit(500);
  if (sp.action) rows = rows.filter((r) => r.action === sp.action);
  const q = (sp.q ?? "").toLowerCase();
  if (q) rows = rows.filter((r) => `${r.unitCode} ${r.previousPersonnel} ${r.newPersonnel}`.toLowerCase().includes(q));
  return (
    <>
      <PageHeader title="Assignment History" description="Riwayat perubahan penugasan: operator sebelumnya, pengganti, alasan, dan admin yang melakukan perubahan." />
      <Card>
        <form className="flex flex-col gap-3 border-b border-gray-100 p-4 md:flex-row md:items-end">
          <Field label="Dari"><input type="date" name="from" defaultValue={from} className="input" /></Field>
          <Field label="Sampai"><input type="date" name="to" defaultValue={to} className="input" /></Field>
          <Field label="Jenis">
            <select name="action" defaultValue={sp.action ?? ""} className="input">
              <option value="">Semua</option>
              {Object.entries(ACTION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="Cari" className="flex-1"><input name="q" defaultValue={sp.q} className="input" placeholder="Unit atau nama operator" /></Field>
          <button className="btn-navy">Terapkan</button>
        </form>
        {rows.length === 0 ? (
          <EmptyState title="Belum ada riwayat pada periode ini" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Waktu</th><th>Tanggal Tugas</th><th>Shift</th><th>Unit</th><th>Aksi</th><th>Operator Sebelumnya</th><th>Operator Baru</th><th>Alasan</th><th>Oleh</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-xs text-gray-500">{formatDateTime(r.createdAt)}</td>
                    <td className="whitespace-nowrap">{formatDate(r.date, { short: true })}</td>
                    <td>{SHIFT_SHORT[r.shift]}</td>
                    <td className="font-mono font-semibold">{r.unitCode}</td>
                    <td><Badge tone={ACTION[r.action]?.tone ?? "gray"}>{ACTION[r.action]?.label ?? r.action}</Badge></td>
                    <td className="text-sm">{r.previousPersonnel ?? "-"}</td>
                    <td className="text-sm">{r.newPersonnel ?? "-"}</td>
                    <td className="text-xs text-gray-600">{r.reason ?? ""}</td>
                    <td className="text-xs">{r.changedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
