import Link from "next/link";
import { desc } from "drizzle-orm";
import { CalendarPlus, CalendarClock, XCircle, LogIn, Plane } from "lucide-react";
import { db } from "@/db";
import { leaves } from "@/db/schema";
import { PageHeader, Card, CardHeader, Badge, EmptyState, Field, Tabs, StatCard } from "@/components/ui";
import { Dialog } from "@/components/client/dialog";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { estimateAllLeaves } from "@/lib/roster";
import { getSetting } from "@/lib/settings";
import { daysLabel } from "@/lib/operations";
import { formatDate, todayStr, diffDays } from "@/lib/dates";
import { LEAVE_STATUS, glTypeLabel } from "@/lib/constants";
import { cancelLeave, endLeaveEarly, saveLeave } from "./actions";

export const metadata = { title: "Cuti Periodik" };

export default async function LeavePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const tab = sp.tab ?? "jadwal";
  const today = todayStr();
  const rules = await getSetting("leave_rules");
  const rows = await db.query.leaves.findMany({ with: { personnel: true, replacements: { with: { replacementPersonnel: true } } }, orderBy: desc(leaves.startDate) });
  const people = await db.query.personnel.findMany({ where: (p, { ne }) => ne(p.workStatus, "RESIGN"), orderBy: (p, { asc }) => asc(p.name) });
  const estimates = await estimateAllLeaves(today);

  const ongoing = rows.filter((r) => r.status === "BERLANGSUNG");
  const upcoming = rows.filter((r) => r.status === "DIJADWALKAN").sort((a, b) => a.startDate.localeCompare(b.startDate));
  const history = rows.filter((r) => r.status === "SELESAI" || r.status === "DIBATALKAN");
  const list = tab === "berlangsung" ? ongoing : tab === "riwayat" ? history : upcoming;
  const unscheduled = estimates.filter((e) => !e.estimate.scheduled).sort((a, b) => a.estimate.daysUntil - b.estimate.daysUntil);

  return (
    <>
      <PageHeader
        title="Cuti Periodik Management"
        description={`Operator: cuti ${rules.durationDays} hari setelah ${rules.operatorWorkdays} hari kerja · Group Leader: setelah ${rules.glWorkdays} hari kerja (dihitung dari hari kerja aktual roster).`}
        actions={
          <Dialog title="Tetapkan Jadwal Cuti" trigger={<><CalendarPlus className="h-4 w-4" /> Tetapkan Cuti</>} size="md">
            <LeaveForm people={people} defaultStart={today} />
          </Dialog>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Sedang cuti" value={ongoing.length} icon={<Plane className="h-5 w-5" />} accent="orange" />
        <StatCard label="Dijadwalkan" value={upcoming.length} icon={<CalendarClock className="h-5 w-5" />} accent="blue" />
        <StatCard label="Estimasi ≤ 30 hari (belum dijadwalkan)" value={unscheduled.filter((u) => u.estimate.daysUntil <= 30).length} accent="brand" />
        <StatCard label="Riwayat cuti" value={history.length} accent="navy" />
      </div>

      <Tabs
        active={tab}
        items={[
          { key: "jadwal", label: `Dijadwalkan (${upcoming.length})`, href: "/admin/cuti?tab=jadwal" },
          { key: "berlangsung", label: `Sedang Cuti (${ongoing.length})`, href: "/admin/cuti?tab=berlangsung" },
          { key: "estimasi", label: "Estimasi Cuti", href: "/admin/cuti?tab=estimasi" },
          { key: "riwayat", label: "Riwayat", href: "/admin/cuti?tab=riwayat" },
        ]}
      />

      {tab === "estimasi" ? (
        <Card>
          <CardHeader title="Perhitungan Estimasi Tanggal Cuti" description="Personel yang belum memiliki jadwal cuti. Tetapkan sesuai estimasi atau sesuaikan tanggalnya." />
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Nama</th><th>Kategori</th><th>Progres Hari Kerja</th><th>Estimasi Mulai</th><th>Selesai</th><th>Sisa</th><th /></tr></thead>
              <tbody>
                {unscheduled.map(({ person, estimate }) => {
                  const pct = Math.min(100, Math.round((estimate.workdaysDone / estimate.requiredWorkdays) * 100));
                  return (
                    <tr key={person.id}>
                      <td><p className="font-semibold">{person.name}</p><p className="text-xs text-gray-500">{person.employeeNo}</p></td>
                      <td className="text-sm">{person.category === "OPERATOR" ? "Operator" : glTypeLabel(person.glType)}</td>
                      <td className="min-w-40">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-gray-100"><div className={`h-2 rounded-full ${pct >= 90 ? "bg-brand" : "bg-navy"}`} style={{ width: `${pct}%` }} /></div>
                          <span className="text-xs tabular-nums text-gray-600">{estimate.workdaysDone}/{estimate.requiredWorkdays}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap">{formatDate(estimate.startDate, { short: true })}</td>
                      <td className="whitespace-nowrap">{formatDate(estimate.endDate, { short: true })}</td>
                      <td><Badge tone={estimate.daysUntil <= 3 ? "red" : estimate.daysUntil <= 14 ? "orange" : "blue"}>{daysLabel(estimate.daysUntil)}</Badge></td>
                      <td className="text-right">
                        <Dialog title={`Tetapkan Cuti — ${person.name}`} trigger="Tetapkan" triggerClassName="btn-outline btn-sm">
                          <LeaveForm people={people} defaultStart={estimate.startDate} defaultEnd={estimate.endDate} personId={person.id} />
                        </Dialog>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card>
          {list.length === 0 ? (
            <EmptyState title="Tidak ada data" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Nama</th><th>Kategori</th><th>Periode</th><th>Durasi</th><th>Status</th><th>Pengganti</th><th>Catatan</th><th className="text-right">Aksi</th></tr></thead>
                <tbody>
                  {list.map((l) => {
                    const st = LEAVE_STATUS[l.status];
                    return (
                      <tr key={l.id}>
                        <td><p className="font-semibold">{l.personnel.name}</p><p className="text-xs text-gray-500">{l.personnel.employeeNo}</p></td>
                        <td className="text-sm">{l.personnel.category === "OPERATOR" ? "Operator" : glTypeLabel(l.personnel.glType)}</td>
                        <td className="whitespace-nowrap text-sm">{formatDate(l.startDate, { short: true })} – {formatDate(l.endDate, { short: true })}
                          {l.status === "DIJADWALKAN" && <div className="text-xs text-gray-500">{daysLabel(diffDays(today, l.startDate))}</div>}
                        </td>
                        <td>{diffDays(l.startDate, l.endDate) + 1} hari</td>
                        <td><Badge tone={st.tone}>{st.label}</Badge></td>
                        <td className="text-sm">
                          {l.replacements.length ? l.replacements.map((r) => r.replacementPersonnel.name).join(", ") : l.status === "SELESAI" || l.status === "DIBATALKAN" ? "-" : (
                            <Link href={`/admin/early-warning/pengganti?person=${l.personnelId}`} className="font-semibold text-brand hover:underline">Cari Pengganti</Link>
                          )}
                        </td>
                        <td className="max-w-48 truncate text-xs text-gray-500">{l.note ?? ""}</td>
                        <td>
                          {(l.status === "DIJADWALKAN" || l.status === "BERLANGSUNG") && (
                            <div className="flex justify-end gap-1">
                              <Dialog title={`Ubah Jadwal Cuti — ${l.personnel.name}`} trigger={<CalendarClock className="h-4 w-4" />} triggerClassName="btn-ghost btn-sm px-2">
                                <LeaveForm people={people} defaultStart={l.startDate} defaultEnd={l.endDate} personId={l.personnelId} leaveId={l.id} note={l.note} />
                              </Dialog>
                              {l.status === "BERLANGSUNG" && (
                                <ActionForm action={endLeaveEarly} confirm="Akhiri cuti hari ini? Personel kembali bekerja mulai besok." showMessage={false}>
                                  <input type="hidden" name="id" value={l.id} />
                                  <SubmitButton className="btn-ghost btn-sm px-2" pendingText="…"><LogIn className="h-4 w-4" /></SubmitButton>
                                </ActionForm>
                              )}
                              <ActionForm action={cancelLeave} confirm="Batalkan cuti ini? Akun akan diaktifkan kembali." showMessage={false}>
                                <input type="hidden" name="id" value={l.id} />
                                <SubmitButton className="btn-ghost btn-sm px-2 text-brand" pendingText="…"><XCircle className="h-4 w-4" /></SubmitButton>
                              </ActionForm>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}

function LeaveForm({
  people,
  defaultStart,
  defaultEnd,
  personId,
  leaveId,
  note,
}: {
  people: { id: string; name: string; employeeNo: string; category: string }[];
  defaultStart: string;
  defaultEnd?: string;
  personId?: string;
  leaveId?: string;
  note?: string | null;
}) {
  return (
    <ActionForm action={saveLeave} className="space-y-4">
      {leaveId && <input type="hidden" name="id" value={leaveId} />}
      <Field label="Personel">
        {leaveId ? (
          <>
            <input type="hidden" name="personnelId" value={personId} />
            <p className="rounded-lg bg-surface px-3 py-2 text-sm font-semibold">{people.find((p) => p.id === personId)?.name}</p>
          </>
        ) : (
          <select name="personnelId" defaultValue={personId ?? ""} className="input" required>
            <option value="" disabled>Pilih personel…</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.employeeNo} ({p.category === "OPERATOR" ? "Operator" : "GL"})</option>)}
          </select>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tanggal Mulai"><input type="date" name="startDate" defaultValue={defaultStart} className="input" required /></Field>
        <Field label="Tanggal Selesai" hint="Kosongkan = sesuai durasi standar"><input type="date" name="endDate" defaultValue={defaultEnd} className="input" /></Field>
      </div>
      <Field label="Catatan / alasan"><input name="note" defaultValue={note ?? ""} className="input" /></Field>
      <p className="text-xs text-gray-500">Akun personel otomatis dinonaktifkan selama periode cuti dan aktif kembali setelahnya.</p>
      <div className="flex justify-end"><SubmitButton>{leaveId ? "Simpan Perubahan" : "Tetapkan Cuti"}</SubmitButton></div>
    </ActionForm>
  );
}
