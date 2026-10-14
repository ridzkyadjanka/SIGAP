import Link from "next/link";
import { FileDown, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { db } from "@/db";
import { PageHeader, Card, CardHeader, EmptyState, Field, cn } from "@/components/ui";
import { REPORT_TYPES, buildReport, parseFilters, type ReportKey } from "@/lib/reports";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { ROSTER_CODES } from "@/lib/constants";

export const metadata = { title: "Laporan" };

const PREVIEW_LIMIT = 300;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const type = (REPORT_TYPES.some((r) => r.key === sp.type) ? sp.type : "daily-manpower") as ReportKey;
  const meta = REPORT_TYPES.find((r) => r.key === type)!;
  const filters = parseFilters(sp);
  const pitList = await db.query.pits.findMany({ orderBy: (p, { asc }) => asc(p.code) });
  const report = await buildReport(type, filters);
  const qs = new URLSearchParams(Object.entries({ from: filters.from, to: filters.to, pit: filters.pit, shift: filters.shift, cat: filters.cat }).filter(([, v]) => v) as [string, string][]);
  const single = "single" in meta && meta.single;

  return (
    <>
      <PageHeader title="Reports & Export" description="Laporan operasional dengan filter periode, lokasi, shift, dan kategori personel. Preview lalu ekspor ke PDF atau Excel." />
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="self-start p-2">
          {REPORT_TYPES.map((r, i) => (
            <Link key={r.key} href={`/admin/laporan?type=${r.key}&${qs}`} className={cn("flex gap-3 rounded-lg px-3 py-2.5 text-sm transition", r.key === type ? "bg-navy text-white" : "text-navy hover:bg-gray-50")}>
              <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold", r.key === type ? "bg-brand" : "bg-gray-100 text-gray-500")}>{i + 1}</span>
              <span>
                <span className="block font-semibold leading-tight">{r.title}</span>
                <span className={cn("block text-xs", r.key === type ? "text-white/60" : "text-gray-500")}>{r.desc}</span>
              </span>
            </Link>
          ))}
        </Card>

        <div className="min-w-0 space-y-4">
          <Card>
            <form className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-6 xl:items-end">
              <input type="hidden" name="type" value={type} />
              {!single && <Field label="Dari"><input type="date" name="from" defaultValue={filters.from} className="input" /></Field>}
              <Field label={single ? "Tanggal" : "Sampai"}><input type="date" name="to" defaultValue={filters.to} className="input" /></Field>
              <Field label="Lokasi">
                <select name="pit" defaultValue={filters.pit ?? ""} className="input">
                  <option value="">Semua</option>
                  {pitList.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
                </select>
              </Field>
              <Field label="Shift">
                <select name="shift" defaultValue={filters.shift ?? ""} className="input">
                  <option value="">Semua</option>
                  <option value="PAGI">Pagi</option>
                  <option value="MALAM">Malam</option>
                </select>
              </Field>
              <Field label="Kategori">
                <select name="cat" defaultValue={filters.cat ?? ""} className="input">
                  <option value="">Semua</option>
                  <option value="OPERATOR">Operator</option>
                  <option value="GROUP_LEADER">Group Leader</option>
                </select>
              </Field>
              <button className="btn-navy">Tampilkan</button>
            </form>
          </Card>

          <Card>
            <CardHeader
              title={<span className="flex items-center gap-2"><FileText className="h-4 w-4 text-brand" /> {report.title}</span>}
              description={`Periode: ${report.period} · ${report.filtersText} · Dibuat ${formatDateTime(new Date())} oleh ${user.name}`}
              actions={
                <>
                  <a href={`/api/reports/${type}?format=pdf&${qs}`} className="btn-primary btn-sm"><FileDown className="h-4 w-4" /> PDF</a>
                  <a href={`/api/reports/${type}?format=xlsx&${qs}`} className="btn-outline btn-sm"><FileSpreadsheet className="h-4 w-4" /> Excel</a>
                </>
              }
            />
            {report.summary && (
              <div className="flex flex-wrap gap-x-8 gap-y-2 border-b border-gray-100 bg-surface px-5 py-3 text-sm">
                {report.summary.map((s) => (
                  <span key={s.label}><span className="text-gray-500">{s.label}:</span> <b>{s.value}</b></span>
                ))}
              </div>
            )}
            {report.rows.length === 0 ? (
              <EmptyState title="Tidak ada data pada periode/filter ini" />
            ) : (
              <div className="table-wrap max-h-[640px] overflow-y-auto">
                <table className="table">
                  <thead className="sticky top-0 z-10">
                    <tr>{report.columns.map((c, i) => <th key={i} className={type === "roster" && i >= 2 ? "px-1 text-center" : ""}>{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {report.rows.slice(0, PREVIEW_LIMIT).map((row, ri) => (
                      <tr key={ri}>
                        {row.map((v, ci) =>
                          type === "roster" && ci >= 2 ? (
                            <td key={ci} className="px-0.5 py-1 text-center">
                              <span className={`block rounded border px-1 text-xs font-bold ${ROSTER_CODES[String(v)]?.className ?? ""}`}>{v}</span>
                            </td>
                          ) : (
                            <td key={ci} className={cn("whitespace-nowrap text-sm", typeof v === "number" && "tabular-nums", type === "manpower-availability" && ci === 8 && Number(v) < 0 && "font-bold text-brand")}>{v}</td>
                          )
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
              <span>{report.rows.length} baris{report.rows.length > PREVIEW_LIMIT ? ` (preview menampilkan ${PREVIEW_LIMIT} baris pertama — ekspor untuk data lengkap)` : ""}</span>
              <span className="flex items-center gap-1"><Printer className="h-3.5 w-3.5" /> Gunakan PDF untuk cetak</span>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
