import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Sun, Moon, Coffee, Plane, Truck, MapPin, Layers, Clock, UtensilsCrossed, CalendarDays, Info } from "lucide-react";
import { db } from "@/db";
import { assignments, notifications } from "@/db/schema";
import { requirePortalUser } from "@/lib/portal";
import { loadRosterContext, rosterCode, estimateLeave } from "@/lib/roster";
import { getShiftTimes } from "@/lib/shifts";
import { getSetting } from "@/lib/settings";
import { addDays, formatDate, formatDateTime, nowTimeStr, todayStr } from "@/lib/dates";
import { glTypeLabel, unitCategoryLabel } from "@/lib/constants";
import { Badge, cn } from "@/components/ui";

export const metadata = { title: "Penugasan Hari Ini" };

export default async function TodayPage() {
  const user = await requirePortalUser();
  const p = user.personnel;
  const today = todayStr();
  const ctx = await loadRosterContext([p.id]);
  const code = rosterCode(p, ctx, today);
  const shift = code === "P" ? "PAGI" : code === "M" ? "MALAM" : null;
  const times = shift ? await getShiftTimes(today, shift, p.pitId) : null;

  // Hanya penugasan milik sendiri yang sudah dipublikasikan
  const mine = async (date: string) =>
    db.query.assignments.findFirst({
      where: and(eq(assignments.personnelId, p.id), eq(assignments.date, date), inArray(assignments.status, ["PUBLISHED", "CHANGED"])),
      with: { unit: true, fleet: true, pit: true },
    });
  const asg = await mine(today);
  // Shift malam kemarin yang masih berjalan sampai pagi
  const yesterday = addDays(today, -1);
  const yCode = rosterCode(p, ctx, yesterday);
  const yTimes = yCode === "M" ? await getShiftTimes(yesterday, "MALAM", p.pitId) : null;
  const nightOngoing = yTimes && nowTimeStr() < yTimes.endTime ? await mine(yesterday) : null;

  const tomorrow = addDays(today, 1);
  const tCode = rosterCode(p, ctx, tomorrow);
  const tAsg = await mine(tomorrow);
  const est = estimateLeave(p, ctx, await getSetting("leave_rules"), today);
  const notifs = await db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(4);
  const isOp = p.category === "OPERATOR";

  const status =
    code === "C" ? { label: "Cuti Periodik", tone: "orange" as const, icon: Plane } :
    code === "L" ? { label: "Libur Hari Ini", tone: "red" as const, icon: Coffee } :
    code === "-" ? { label: "Tidak Ada Penugasan", tone: "gray" as const, icon: Info } :
    isOp && !asg ? { label: "Menunggu Publikasi Penugasan", tone: "blue" as const, icon: Clock } :
    { label: "Bertugas Hari Ini", tone: "green" as const, icon: shift === "PAGI" ? Sun : Moon };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-gray-500">{formatDate(today, { withDay: true })}</p>
        <h1 className="text-2xl font-extrabold">Selamat Datang, {p.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={status.tone}><status.icon className="h-3.5 w-3.5" /> Status: {status.label}</Badge>
          {!isOp && <Badge tone="navy">{glTypeLabel(p.glType)}</Badge>}
        </div>
      </div>

      {nightOngoing && yTimes && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <Moon className="mt-0.5 h-5 w-5 shrink-0" />
          <p>Shift malam Anda (mulai {formatDate(yesterday, { short: true })} {yTimes.startTime}) masih berjalan hingga pukul <b>{yTimes.endTime}</b> pada unit <b>{nightOngoing.unit.code}</b>.</p>
        </div>
      )}

      {/* Kartu penugasan utama */}
      <div className={cn("overflow-hidden rounded-2xl shadow-card", shift === "PAGI" ? "bg-gradient-to-br from-emerald-600 to-emerald-700" : shift === "MALAM" ? "bg-gradient-to-br from-navy to-navy-light" : code === "C" ? "bg-gradient-to-br from-orange-500 to-orange-600" : "bg-gradient-to-br from-gray-500 to-gray-600")}>
        <div className="p-6 text-white">
          {shift && times ? (
            <>
              <p className="text-sm font-semibold uppercase tracking-wider text-white/70">{times.name}</p>
              <p className="mt-1 text-4xl font-extrabold">{times.startTime} – {times.endTime}</p>
              <p className="mt-1 text-sm text-white/80">Istirahat {times.breakStart} – {times.breakEnd}{shift === "MALAM" ? " · selesai hari berikutnya" : ""}</p>
              {times.overridden && <p className="mt-3 inline-block rounded-lg bg-white/15 px-3 py-1.5 text-xs">⚠ Jam kerja khusus hari ini: {times.reason}</p>}
            </>
          ) : code === "C" ? (
            <>
              <p className="text-sm font-semibold uppercase tracking-wider text-white/70">Cuti Periodik</p>
              <p className="mt-1 text-2xl font-extrabold">{formatDate(est.startDate)} – {formatDate(est.endDate)}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold uppercase tracking-wider text-white/70">{code === "L" ? "Hari Libur" : "Tidak ada jadwal"}</p>
              <p className="mt-1 text-2xl font-extrabold">{code === "L" ? "Selamat beristirahat" : "Belum ada roster untuk hari ini"}</p>
            </>
          )}
        </div>
        {shift && (
          <div className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-4">
            {isOp ? (
              asg ? (
                <>
                  <Info2 icon={<Truck className="h-4 w-4" />} label="Unit" value={asg.unit.code} />
                  <Info2 icon={<Truck className="h-4 w-4" />} label="Jenis Unit" value={`${unitCategoryLabel(asg.unit.category).split(" (")[0]} ${asg.unit.model.replace("Mercedes-Benz ", "")}`} />
                  <Info2 icon={<Layers className="h-4 w-4" />} label="Fleet" value={asg.fleet?.name ?? "-"} />
                  <Info2 icon={<MapPin className="h-4 w-4" />} label="Lokasi/PIT" value={asg.pit?.name ?? "-"} />
                </>
              ) : (
                <div className="col-span-2 bg-black/10 px-5 py-4 text-sm text-white/90 sm:col-span-4">Penugasan unit belum dipublikasikan oleh Admin Manpower. Silakan cek kembali sebelum shift dimulai.</div>
              )
            ) : (
              <>
                <Info2 icon={<CalendarDays className="h-4 w-4" />} label="Jabatan" value={glTypeLabel(p.glType)} />
                <Info2 icon={<MapPin className="h-4 w-4" />} label="Lokasi" value={user.personnel.pit?.name ?? "-"} />
                <Info2 icon={<Clock className="h-4 w-4" />} label="Jam Kerja" value={`${times!.startTime}–${times!.endTime}`} />
                <Info2 icon={<UtensilsCrossed className="h-4 w-4" />} label="Istirahat" value={`${times!.breakStart}–${times!.breakEnd}`} />
              </>
            )}
          </div>
        )}
      </div>

      {isOp && asg && times && (
        <div className="card overflow-hidden">
          <table className="table">
            <tbody>
              {[
                ["Unit", asg.unit.code],
                ["Jenis Unit", `${unitCategoryLabel(asg.unit.category)} — ${asg.unit.model}`],
                ["Fleet", asg.fleet?.name ?? "-"],
                ["Lokasi/PIT", asg.pit?.name ?? "-"],
                ["Shift", shift === "PAGI" ? "Pagi" : "Malam"],
                ["Jam Kerja", `${times.startTime}–${times.endTime}`],
                ["Istirahat", `${times.breakStart}–${times.breakEnd}`],
              ].map(([k, v]) => (
                <tr key={k}><td className="w-40 font-medium text-gray-500">{k}</td><td className="font-semibold">{v}</td></tr>
              ))}
            </tbody>
          </table>
          {asg.status === "CHANGED" && <p className="border-t border-gray-100 bg-orange-50 px-4 py-2 text-xs text-orange-800">Penugasan ini telah diperbarui oleh admin.</p>}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Besok · {formatDate(tomorrow, { withDay: true })}</p>
          <p className="mt-2 text-lg font-bold">{tCode === "P" ? "Shift Pagi" : tCode === "M" ? "Shift Malam" : tCode === "L" ? "Libur" : tCode === "C" ? "Cuti Periodik" : "Tidak ada jadwal"}</p>
          {isOp && tAsg && <p className="text-sm text-gray-600">Unit {tAsg.unit.code} · {tAsg.pit?.name}</p>}
          <Link href="/portal/roster" className="mt-3 inline-block text-sm font-semibold text-brand hover:underline">Lihat roster lengkap →</Link>
        </div>
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Cuti Periodik</p>
          {est.scheduled ? (
            <>
              <p className="mt-2 text-lg font-bold">{formatDate(est.startDate)} – {formatDate(est.endDate)}</p>
              <p className="text-sm text-gray-600">{est.onLeave ? "Sedang berlangsung" : `${est.daysUntil} hari lagi · sudah ditetapkan`}</p>
            </>
          ) : (
            <>
              <p className="mt-2 text-lg font-bold">Belum ditetapkan</p>
              <p className="text-sm text-gray-600">Jadwal cuti akan tampil setelah ditetapkan oleh admin.</p>
            </>
          )}
        </div>
      </div>

      {notifs.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <p className="text-sm font-bold">Informasi Terbaru</p>
            <Link href="/portal/notifikasi" className="text-xs font-semibold text-brand">Semua</Link>
          </div>
          <ul className="divide-y divide-gray-100">
            {notifs.map((n) => (
              <li key={n.id} className="px-5 py-3">
                <p className={cn("text-sm", !n.isRead && "font-semibold")}>{n.title}</p>
                <p className="text-xs text-gray-600">{n.message}</p>
                <p className="mt-0.5 text-[11px] text-gray-400">{formatDateTime(n.createdAt)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Info2({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-black/10 px-5 py-4 text-white">
      <p className="flex items-center gap-1.5 text-xs text-white/70">{icon} {label}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}
