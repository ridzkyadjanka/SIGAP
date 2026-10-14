import Link from "next/link";
import { and, count, desc, eq } from "drizzle-orm";
import { Users, UserCheck, UserX, Plane, Truck, Activity, PauseCircle, Layers, MapPinned, ShieldCheck, Sun, Moon, ArrowRight, AlertTriangle } from "lucide-react";
import { db } from "@/db";
import { assignments, fleets, notifications, personnel, pits, units } from "@/db/schema";
import { PageHeader, StatCard, Card, CardHeader, Badge, EmptyState } from "@/components/ui";
import { SimpleBar, Donut, GroupedBar } from "@/components/client/charts";
import { formatDate, formatDateTime, todayStr } from "@/lib/dates";
import { getShiftTimes } from "@/lib/shifts";
import { availabilityFor, daysLabel } from "@/lib/operations";
import { estimateAllLeaves } from "@/lib/roster";
import { UNIT_CATEGORIES, unitCategoryLabel, glTypeLabel } from "@/lib/constants";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const today = todayStr();
  const people = await db.select().from(personnel);
  const ops = people.filter((p) => p.category === "OPERATOR");
  const gls = people.filter((p) => p.category === "GROUP_LEADER");
  const allUnits = await db.select().from(units);
  const [{ fleetCount }] = await db.select({ fleetCount: count() }).from(fleets);
  const pitList = await db.select().from(pits).orderBy(pits.code);

  const todayAsg = await db
    .select({ shift: assignments.shift, unitId: assignments.unitId, personnelId: assignments.personnelId, status: assignments.status })
    .from(assignments)
    .where(eq(assignments.date, today));

  const shifts = await Promise.all(
    (["PAGI", "MALAM"] as const).map(async (code) => {
      const t = await getShiftTimes(today, code);
      const asg = todayAsg.filter((a) => a.shift === code);
      const avail = await availabilityFor(today, code);
      const ready = avail.filter((a) => a.available || a.assignedUnit).length;
      return { code, t, operators: asg.length, units: new Set(asg.map((a) => a.unitId)).size, ready, published: asg.filter((a) => a.status !== "DRAFT").length };
    })
  );
  const opUnits = allUnits.filter((u) => u.status === "OPERASI").length;

  // Grafik
  const bySkill = UNIT_CATEGORIES.map((c) => ({
    name: c.label.replace(" (Sany SRT100S)", ""),
    value: ops.filter((o) => o.workStatus !== "RESIGN" && o.skills.includes(c.value)).length,
  })).filter((d) => d.value > 0);
  const byPit = pitList.map((p) => ({
    name: p.code,
    value: people.filter((x) => x.pitId === p.id && x.workStatus !== "RESIGN").length,
  }));
  const status = [
    { name: "Aktif", value: ops.filter((o) => o.workStatus === "AKTIF").length, color: "#10B981" },
    { name: "Cuti", value: ops.filter((o) => o.workStatus === "CUTI").length, color: "#F59E0B" },
    { name: "Sakit", value: ops.filter((o) => o.workStatus === "SAKIT").length, color: "#C8102E" },
    { name: "Resign", value: ops.filter((o) => o.workStatus === "RESIGN").length, color: "#9CA3AF" },
  ];
  const supplyDemand = shifts.map((s) => ({ name: s.code === "PAGI" ? "Shift Pagi" : "Shift Malam", tersedia: s.ready, kebutuhan: opUnits }));

  const notifs = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.forAdmin, true), eq(notifications.isRead, false)))
    .orderBy(desc(notifications.createdAt))
    .limit(6);
  const upcoming = (await estimateAllLeaves(today))
    .filter((x) => !x.estimate.onLeave && x.estimate.daysUntil <= 30)
    .sort((a, b) => a.estimate.daysUntil - b.estimate.daysUntil)
    .slice(0, 6);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Ringkasan kondisi operasional — ${formatDate(today, { withDay: true })}`}
        actions={
          <>
            <Link href="/admin/penugasan" className="btn-primary">Atur Penugasan Hari Ini</Link>
            <Link href="/admin/laporan" className="btn-outline">Laporan</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total Operator" value={ops.filter((o) => o.workStatus !== "RESIGN").length} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Total Group Leader" value={gls.filter((o) => o.workStatus !== "RESIGN").length} icon={<ShieldCheck className="h-5 w-5" />} />
        <StatCard label="Operator Aktif" value={ops.filter((o) => o.workStatus === "AKTIF").length} icon={<UserCheck className="h-5 w-5" />} accent="green" />
        <StatCard label="Operator Tidak Aktif" value={ops.filter((o) => o.workStatus === "SAKIT" || o.workStatus === "RESIGN").length} hint="Sakit / resign" icon={<UserX className="h-5 w-5" />} accent="brand" />
        <StatCard label="Operator Sedang Cuti" value={ops.filter((o) => o.workStatus === "CUTI").length} icon={<Plane className="h-5 w-5" />} accent="orange" />
        <StatCard label="Total Unit" value={allUnits.length} icon={<Truck className="h-5 w-5" />} />
        <StatCard label="Unit Beroperasi" value={opUnits} icon={<Activity className="h-5 w-5" />} accent="green" />
        <StatCard label="Unit Standby" value={allUnits.filter((u) => u.status === "STANDBY").length} hint={`${allUnits.filter((u) => u.status === "BREAKDOWN").length} breakdown`} icon={<PauseCircle className="h-5 w-5" />} accent="orange" />
        <StatCard label="Total Fleet" value={fleetCount} icon={<Layers className="h-5 w-5" />} accent="blue" />
        <StatCard label="Total Lokasi / PIT" value={pitList.length} icon={<MapPinned className="h-5 w-5" />} accent="blue" />
      </div>

      {/* Informasi shift */}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {shifts.map((s) => (
          <Card key={s.code} className="overflow-hidden">
            <div className={`flex items-center justify-between px-5 py-4 ${s.code === "PAGI" ? "bg-emerald-50" : "bg-blue-50"}`}>
              <div className="flex items-center gap-3">
                <div className={`rounded-lg p-2 ${s.code === "PAGI" ? "bg-emerald-500" : "bg-blue-600"} text-white`}>
                  {s.code === "PAGI" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </div>
                <div>
                  <p className="font-bold text-navy">{s.t.name}</p>
                  <p className="text-xs text-gray-600">
                    {s.t.startTime}–{s.t.endTime} · Istirahat {s.t.breakStart}–{s.t.breakEnd}
                  </p>
                </div>
              </div>
              {s.t.overridden && <Badge tone="orange">Jam khusus: {s.t.reason}</Badge>}
            </div>
            <div className="grid grid-cols-3 divide-x divide-gray-100 text-center">
              <div className="p-4">
                <p className="text-2xl font-bold text-navy">{s.operators}</p>
                <p className="text-xs text-gray-500">Operator bertugas</p>
              </div>
              <div className="p-4">
                <p className="text-2xl font-bold text-navy">{s.units}<span className="text-sm font-medium text-gray-400">/{opUnits}</span></p>
                <p className="text-xs text-gray-500">Unit terisi</p>
              </div>
              <div className="p-4">
                <p className={`text-2xl font-bold ${s.ready < opUnits ? "text-brand" : "text-emerald-600"}`}>{s.ready}</p>
                <p className="text-xs text-gray-500">Operator siap</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Grafik */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Distribusi Operator berdasarkan Jenis Unit" description="Berdasarkan skill unit (satu operator dapat memiliki beberapa skill)" />
          <div className="p-4"><SimpleBar data={bySkill} /></div>
        </Card>
        <Card>
          <CardHeader title="Manpower per Lokasi / PIT" description="Operator & Group Leader aktif per penempatan" />
          <div className="p-4"><SimpleBar data={byPit} color="#C8102E" /></div>
        </Card>
        <Card>
          <CardHeader title="Status Ketersediaan Operator" />
          <div className="p-4"><Donut data={status} /></div>
        </Card>
        <Card>
          <CardHeader title="Operator Tersedia vs Kebutuhan Unit" description="Kebutuhan = jumlah unit berstatus beroperasi" />
          <div className="p-4">
            <GroupedBar data={supplyDemand} keys={[{ key: "tersedia", label: "Operator tersedia", color: "#14213D" }, { key: "kebutuhan", label: "Kebutuhan unit", color: "#C8102E" }]} />
          </div>
        </Card>
      </div>

      {/* Notifikasi & cuti mendatang */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Notifikasi Penting" actions={<Link href="/admin/notifikasi" className="text-xs font-semibold text-brand hover:underline">Lihat semua</Link>} />
          {notifs.length === 0 ? (
            <EmptyState title="Tidak ada notifikasi baru" />
          ) : (
            <ul className="divide-y divide-gray-100">
              {notifs.map((n) => (
                <li key={n.id} className="flex gap-3 px-5 py-3">
                  <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${n.type.includes("URGENT") || n.type.includes("SHORT") ? "text-brand" : "text-orange-500"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-navy">{n.title}</p>
                    <p className="text-xs text-gray-600">{n.message}</p>
                    <p className="mt-1 text-[11px] text-gray-400">{formatDateTime(n.createdAt)}</p>
                  </div>
                  {n.link && <Link href={n.link} className="self-center text-gray-400 hover:text-brand"><ArrowRight className="h-4 w-4" /></Link>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Cuti Periodik Mendatang (30 hari)" actions={<Link href="/admin/early-warning" className="text-xs font-semibold text-brand hover:underline">Early Warning</Link>} />
          {upcoming.length === 0 ? (
            <EmptyState title="Tidak ada cuti dalam 30 hari ke depan" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Nama</th><th>Jabatan</th><th>Mulai</th><th>Sisa</th></tr></thead>
                <tbody>
                  {upcoming.map(({ person, estimate }) => (
                    <tr key={person.id}>
                      <td className="font-medium">{person.name}</td>
                      <td className="text-gray-600">{person.category === "OPERATOR" ? person.skills.map(unitCategoryLabel).join(", ") : glTypeLabel(person.glType)}</td>
                      <td>{formatDate(estimate.startDate, { short: true })}{!estimate.scheduled && <span className="ml-1 text-xs text-gray-400">(estimasi)</span>}</td>
                      <td><Badge tone={estimate.daysUntil <= 3 ? "red" : estimate.daysUntil <= 7 ? "orange" : "blue"}>{daysLabel(estimate.daysUntil)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
