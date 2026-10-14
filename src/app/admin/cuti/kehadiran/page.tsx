import { eq } from "drizzle-orm";
import { Stethoscope, UserCheck } from "lucide-react";
import { db } from "@/db";
import { assignments, units } from "@/db/schema";
import { PageHeader, Card, Badge, Field, StatCard } from "@/components/ui";
import { Dialog } from "@/components/client/dialog";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { FilterForm } from "@/components/client/auto-submit";
import { loadRosterContext, rosterCode } from "@/lib/roster";
import { activeDeactivation } from "@/lib/auth";
import { addDays, formatDate, todayStr } from "@/lib/dates";
import { ROSTER_CODES, WORK_STATUS, deactivationLabel, glTypeLabel } from "@/lib/constants";
import { markActive, markSick } from "../actions";

export const metadata = { title: "Status Kehadiran" };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const today = todayStr();
  let people = await db.query.personnel.findMany({ where: (p, { ne }) => ne(p.workStatus, "RESIGN"), with: { user: true, pit: true }, orderBy: (p, { asc }) => asc(p.name) });
  if (sp.cat) people = people.filter((p) => p.category === sp.cat);
  if (sp.status) people = people.filter((p) => p.workStatus === sp.status);
  const q = (sp.q ?? "").toLowerCase();
  if (q) people = people.filter((p) => p.name.toLowerCase().includes(q) || p.employeeNo.toLowerCase().includes(q));
  const ctx = await loadRosterContext(people.map((p) => p.id));
  const asg = await db.select({ personnelId: assignments.personnelId, code: units.code, shift: assignments.shift }).from(assignments).innerJoin(units, eq(units.id, assignments.unitId)).where(eq(assignments.date, today));
  const rows = await Promise.all(
    people.map(async (p) => ({ p, code: rosterCode(p, ctx, today), block: p.user ? await activeDeactivation(p.user.id) : undefined, a: asg.find((x) => x.personnelId === p.id) }))
  );
  const count = (c: string) => rows.filter((r) => r.code === c).length;

  return (
    <>
      <PageHeader title="Status Kehadiran" description={`Kondisi personel hari ini — ${formatDate(today, { withDay: true })}. Tandai sakit untuk memblokir akun sementara & mengeluarkan dari daftar tersedia.`} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Roster Pagi" value={count("P")} accent="green" />
        <StatCard label="Roster Malam" value={count("M")} accent="blue" />
        <StatCard label="Libur" value={count("L")} accent="brand" />
        <StatCard label="Cuti" value={count("C")} accent="orange" />
        <StatCard label="Sakit" value={rows.filter((r) => r.p.workStatus === "SAKIT").length} accent="brand" />
      </div>
      <Card>
        <FilterForm className="flex flex-col gap-3 border-b border-gray-100 p-4 md:flex-row">
          <input name="q" data-noauto defaultValue={sp.q} placeholder="Cari nama / nomor pegawai…" className="input flex-1" />
          <select name="cat" defaultValue={sp.cat ?? ""} className="input md:w-44">
            <option value="">Semua kategori</option>
            <option value="OPERATOR">Operator</option>
            <option value="GROUP_LEADER">Group Leader</option>
          </select>
          <select name="status" defaultValue={sp.status ?? ""} className="input md:w-40">
            <option value="">Semua status</option>
            {WORK_STATUS.filter((s) => s.value !== "RESIGN").map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button className="btn-navy">Filter</button>
        </FilterForm>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Nama</th><th>Jabatan</th><th>PIT</th><th>Roster Hari Ini</th><th>Penugasan</th><th>Status Kerja</th><th>Akun</th><th className="text-right">Aksi</th></tr></thead>
            <tbody>
              {rows.map(({ p, code, block, a }) => {
                const ws = WORK_STATUS.find((s) => s.value === p.workStatus)!;
                return (
                  <tr key={p.id}>
                    <td><p className="font-semibold">{p.name}</p><p className="text-xs text-gray-500">{p.employeeNo}</p></td>
                    <td className="text-sm">{p.category === "OPERATOR" ? "Operator" : glTypeLabel(p.glType)}</td>
                    <td className="text-sm">{p.pit?.code ?? "-"}</td>
                    <td><span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${ROSTER_CODES[code].className}`}>{ROSTER_CODES[code].label}</span></td>
                    <td className="font-mono text-sm">{a ? `${a.code} (${a.shift === "PAGI" ? "P" : "M"})` : "-"}</td>
                    <td><Badge tone={ws.tone}>{ws.label}</Badge></td>
                    <td>{block ? <Badge tone="orange">Diblokir: {deactivationLabel(block.reason)}{block.endDate ? ` s.d. ${formatDate(block.endDate, { short: true })}` : ""}</Badge> : p.user?.isActive ? <Badge tone="green">Aktif</Badge> : <Badge tone="gray">-</Badge>}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        {p.workStatus === "SAKIT" ? (
                          <ActionForm action={markActive} showMessage={false} confirm={`Tandai ${p.name} kembali aktif?`}>
                            <input type="hidden" name="personnelId" value={p.id} />
                            <SubmitButton className="btn-outline btn-sm" pendingText="…"><UserCheck className="h-4 w-4" /> Aktif</SubmitButton>
                          </ActionForm>
                        ) : p.workStatus === "AKTIF" ? (
                          <Dialog title={`Tandai Sakit — ${p.name}`} trigger={<><Stethoscope className="h-4 w-4" /> Sakit</>} triggerClassName="btn-outline btn-sm" size="sm">
                            <ActionForm action={markSick} className="space-y-4">
                              <input type="hidden" name="personnelId" value={p.id} />
                              <div className="grid grid-cols-2 gap-3">
                                <Field label="Mulai"><input type="date" name="start" defaultValue={today} className="input" required /></Field>
                                <Field label="Sampai"><input type="date" name="end" defaultValue={addDays(today, 2)} className="input" required /></Field>
                              </div>
                              <Field label="Keterangan"><input name="note" className="input" placeholder="Mis. surat dokter" /></Field>
                              {a && <p className="rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-800">Personel ini memiliki penugasan {a.code} hari ini. Lakukan Quick Replacement setelah menyimpan.</p>}
                              <SubmitButton className="btn-primary w-full">Simpan</SubmitButton>
                            </ActionForm>
                          </Dialog>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
