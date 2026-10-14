import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requirePortalUser } from "@/lib/portal";
import { loadRosterContext, rosterFor, estimateLeave } from "@/lib/roster";
import { getSetting } from "@/lib/settings";
import { getShiftConfigs } from "@/lib/shifts";
import { dayName, dayOfWeek, formatDate, monthLabel, monthRange, parseMonthParam, shiftMonth, todayStr } from "@/lib/dates";
import { ROSTER_CODES } from "@/lib/constants";
import { cn } from "@/components/ui";

export const metadata = { title: "Roster Saya" };

export default async function MyRosterPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requirePortalUser();
  const p = user.personnel;
  const sp = await searchParams;
  const { year, month } = parseMonthParam(sp.month);
  const { days } = monthRange(year, month);
  const today = todayStr();
  const ctx = await loadRosterContext([p.id]); // hanya roster milik sendiri
  const r = rosterFor(p, ctx, days);
  const shifts = await getShiftConfigs();
  const timeOf = (c: string) => (c === "P" ? shifts[0] : c === "M" ? shifts[1] : null);
  const est = estimateLeave(p, ctx, await getSetting("leave_rules"), today);
  const lead = (dayOfWeek(days[0]) + 6) % 7;
  const view = sp.view === "tabel" ? "tabel" : "kalender";
  const q = (extra: Record<string, string>) => `/portal/roster?${new URLSearchParams({ ...(sp.month ? { month: sp.month } : {}), view, ...extra })}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Roster Saya</h1>
          <p className="text-sm text-gray-500">Jadwal kerja pribadi Anda.</p>
        </div>
        <div className="flex rounded-lg border border-gray-300 bg-white p-0.5 text-sm font-semibold">
          <Link href={q({ view: "kalender" })} className={cn("rounded-md px-4 py-1.5", view === "kalender" ? "bg-navy text-white" : "text-gray-600")}>Kalender</Link>
          <Link href={q({ view: "tabel" })} className={cn("rounded-md px-4 py-1.5", view === "tabel" ? "bg-navy text-white" : "text-gray-600")}>Tabel</Link>
        </div>
      </div>

      {est.scheduled && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          Cuti periodik: <b>{formatDate(est.startDate)} – {formatDate(est.endDate)}</b>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <Link href={q({ month: shiftMonth(year, month, -1) })} className="btn-ghost btn-sm px-2" aria-label="Bulan sebelumnya"><ChevronLeft className="h-4 w-4" /></Link>
          <span className="font-bold">{monthLabel(year, month)}</span>
          <Link href={q({ month: shiftMonth(year, month, 1) })} className="btn-ghost btn-sm px-2" aria-label="Bulan berikutnya"><ChevronRight className="h-4 w-4" /></Link>
        </div>
        <div className="flex flex-wrap gap-3 border-b border-gray-100 px-4 py-2.5 text-xs">
          {[["P", "Hijau: Shift Pagi"], ["M", "Biru: Shift Malam"], ["L", "Merah: Libur"], ["C", "Oranye: Cuti Periodik"], ["-", "Abu-abu: Tidak Ada Penugasan"]].map(([k, l]) => (
            <span key={k} className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded-sm ${ROSTER_CODES[k].dot}`} /> {l}</span>
          ))}
        </div>
        {view === "kalender" ? (
          <div className="grid grid-cols-7 gap-1 p-3 text-center sm:gap-2 sm:p-4">
            {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => <div key={d} className="text-xs font-semibold text-gray-500">{d}</div>)}
            {Array.from({ length: lead }).map((_, i) => <div key={`x${i}`} />)}
            {r.map((c) => (
              <div key={c.date} className={cn("rounded-lg border p-1 sm:p-2", ROSTER_CODES[c.code].className, c.date === today && "ring-2 ring-brand ring-offset-1")}>
                <div className="text-xs font-bold sm:text-sm">{Number(c.date.slice(8))}</div>
                <div className="text-[10px] font-semibold sm:text-xs">{c.code === "-" ? "–" : c.code}</div>
                {timeOf(c.code) && <div className="hidden text-[10px] opacity-75 sm:block">{timeOf(c.code)!.startTime}</div>}
              </div>
            ))}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Tanggal</th><th>Hari</th><th>Shift</th><th>Jam Kerja</th><th>Status</th></tr></thead>
              <tbody>
                {r.map((c) => {
                  const t = timeOf(c.code);
                  return (
                    <tr key={c.date} className={c.date === today ? "bg-brand-light/40" : ""}>
                      <td className="whitespace-nowrap font-medium">{formatDate(c.date, { short: true })}</td>
                      <td>{dayName(c.date)}</td>
                      <td>{c.code === "P" ? "Pagi" : c.code === "M" ? "Malam" : "-"}</td>
                      <td className="whitespace-nowrap">{t ? `${t.startTime}–${t.endTime}` : "-"}</td>
                      <td><span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${ROSTER_CODES[c.code].className}`}>{c.code === "P" || c.code === "M" ? "Kerja" : ROSTER_CODES[c.code].label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
