import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { Sun, Moon, Wand2, Send, UserPlus, RefreshCw, Trash2, AlertTriangle, History } from "lucide-react";
import { db } from "@/db";
import { assignments } from "@/db/schema";
import { PageHeader, Card, CardHeader, Badge, Field, cn } from "@/components/ui";
import { Dialog } from "@/components/client/dialog";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { FilterForm } from "@/components/client/auto-submit";
import { availabilityFor, type Availability } from "@/lib/operations";
import { getShiftTimes } from "@/lib/shifts";
import { addDays, formatDate, isValidDate, todayStr } from "@/lib/dates";
import { UNIT_STATUS, unitCategoryLabel } from "@/lib/constants";
import { assignOperator, autoFill, publishAssignments, removeAssignment } from "./actions";

export const metadata = { title: "Penugasan Harian" };

const STATUS_BADGE = {
  DRAFT: { label: "Draft", tone: "gray" },
  PUBLISHED: { label: "Published", tone: "green" },
  CHANGED: { label: "Changed", tone: "orange" },
} as const;

export default async function AssignmentPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const date = isValidDate(sp.date) ? sp.date : todayStr();
  const shift = sp.shift === "MALAM" ? "MALAM" : "PAGI";
  const pitList = await db.query.pits.findMany({ orderBy: (p, { asc }) => asc(p.code) });
  const fleetList = await db.query.fleets.findMany({ orderBy: (f, { asc }) => asc(f.code) });
  const times = await getShiftTimes(date, shift, sp.pit || null);

  let unitList = await db.query.units.findMany({ with: { pit: true, fleet: true }, orderBy: (u, { asc }) => asc(u.code) });
  if (sp.pit) unitList = unitList.filter((u) => u.pitId === sp.pit);
  if (sp.fleet) unitList = unitList.filter((u) => u.fleetId === sp.fleet);
  const order = { OPERASI: 0, STANDBY: 1, BREAKDOWN: 2 };
  unitList.sort((a, b) => order[a.status] - order[b.status] || (a.fleet?.code ?? "zz").localeCompare(b.fleet?.code ?? "zz") || a.code.localeCompare(b.code));

  const asg = await db.query.assignments.findMany({
    where: and(eq(assignments.date, date), eq(assignments.shift, shift)),
    with: { personnel: true },
  });
  const avail = await availabilityFor(date, shift);
  const byUnit = new Map(asg.map((a) => [a.unitId, a]));
  const opUnits = unitList.filter((u) => u.status === "OPERASI");
  const filled = opUnits.filter((u) => byUnit.has(u.id)).length;
  const drafts = asg.filter((a) => a.status === "DRAFT" && (!sp.pit || a.pitId === sp.pit)).length;
  const pool = avail.filter((a) => a.available && !a.assignedUnit);
  const unavailableAssigned = asg.filter((a) => {
    const x = avail.find((v) => v.id === a.personnelId);
    return x && ["Sedang sakit", "Sedang cuti periodik", "Akun nonaktif"].includes(x.reason ?? "");
  });

  const href = (extra: Record<string, string>) => `/admin/penugasan?${new URLSearchParams({ date, shift, ...(sp.pit ? { pit: sp.pit } : {}), ...(sp.fleet ? { fleet: sp.fleet } : {}), ...extra })}`;
  const common = (
    <>
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="shift" value={shift} />
    </>
  );

  return (
    <>
      <PageHeader
        title="Daily Manpower & Assignment"
        description="Pilih tanggal, shift, PIT, dan fleet, lalu tetapkan operator untuk setiap unit. Hanya penugasan yang dipublikasikan tampil di akun operator."
        actions={
          <Link href="/admin/penugasan/riwayat" className="btn-outline"><History className="h-4 w-4" /> Riwayat Perubahan</Link>
        }
      />

      <Card className="mb-4">
        <FilterForm className="flex flex-col gap-3 p-4 lg:flex-row lg:items-end">
          <Field label="Tanggal" className="lg:w-44"><input type="date" name="date" defaultValue={date} className="input" /></Field>
          <div>
            <span className="label">Shift</span>
            <div className="flex rounded-lg border border-gray-300 p-0.5">
              {(["PAGI", "MALAM"] as const).map((s) => (
                <Link key={s} href={href({ shift: s })} className={cn("flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-semibold", shift === s ? (s === "PAGI" ? "bg-emerald-600 text-white" : "bg-blue-600 text-white") : "text-gray-600 hover:bg-gray-100")}>
                  {s === "PAGI" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {s === "PAGI" ? "Pagi" : "Malam"}
                </Link>
              ))}
            </div>
            <input type="hidden" name="shift" value={shift} />
          </div>
          <Field label="Lokasi / PIT" className="lg:w-56">
            <select name="pit" defaultValue={sp.pit ?? ""} className="input">
              <option value="">Semua PIT</option>
              {pitList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Fleet" className="lg:w-40">
            <select name="fleet" defaultValue={sp.fleet ?? ""} className="input">
              <option value="">Semua fleet</option>
              {fleetList.map((f) => <option key={f.id} value={f.id}>{f.code}</option>)}
            </select>
          </Field>
          <div className="flex gap-2 lg:ml-auto">
            <Link href={href({ date: addDays(date, -1) })} className="btn-outline btn-sm">‹ Kemarin</Link>
            <Link href={href({ date: todayStr() })} className="btn-outline btn-sm">Hari ini</Link>
            <Link href={href({ date: addDays(date, 1) })} className="btn-outline btn-sm">Besok ›</Link>
          </div>
        </FilterForm>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-gray-100 px-4 py-3 text-sm">
          <span className="font-semibold">{formatDate(date, { withDay: true })}</span>
          <span className="text-gray-600">{times.name}: {times.startTime}–{times.endTime} · Istirahat {times.breakStart}–{times.breakEnd}</span>
          {times.overridden && <Badge tone="orange">Jam khusus: {times.reason}</Badge>}
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Summary label="Unit beroperasi" value={opUnits.length} />
        <Summary label="Unit terisi" value={`${filled}/${opUnits.length}`} tone={filled < opUnits.length ? "text-brand" : "text-emerald-600"} />
        <Summary label="Draft belum publish" value={drafts} tone={drafts ? "text-orange-600" : undefined} />
        <Summary label="Operator standby (tersedia)" value={pool.length} />
      </div>

      {unavailableAssigned.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Operator tidak tersedia namun memiliki penugasan</p>
            <p>{unavailableAssigned.map((a) => a.personnel.name).join(", ")} — gunakan tombol Quick Replacement pada baris unit terkait.</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <Card>
          <CardHeader
            title="Penugasan Unit"
            description="Validasi otomatis: satu operator hanya pada satu unit per waktu, sesuai roster, skill, dan status."
            actions={
              <>
                <ActionForm action={autoFill} confirm="Isi otomatis unit kosong dengan operator tersedia (sebagai draft)?">
                  {common}
                  {sp.pit && <input type="hidden" name="pitId" value={sp.pit} />}
                  <SubmitButton className="btn-outline btn-sm" pendingText="Memproses…"><Wand2 className="h-4 w-4" /> Isi Otomatis</SubmitButton>
                </ActionForm>
                <ActionForm action={publishAssignments} confirm="Publikasikan semua draft? Operator akan melihat penugasan di portal.">
                  {common}
                  {sp.pit && <input type="hidden" name="pitId" value={sp.pit} />}
                  <SubmitButton className="btn-primary btn-sm" pendingText="Mempublikasikan…"><Send className="h-4 w-4" /> Publish ({drafts})</SubmitButton>
                </ActionForm>
              </>
            }
          />
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Unit</th><th>Fleet / PIT</th><th>Status Unit</th><th>Operator</th><th>Status</th><th className="text-right">Aksi</th></tr>
              </thead>
              <tbody>
                {unitList.map((u) => {
                  const a = byUnit.get(u.id);
                  const us = UNIT_STATUS.find((s) => s.value === u.status)!;
                  const x = a ? avail.find((v) => v.id === a.personnelId) : undefined;
                  const problem = x && ["Sedang sakit", "Sedang cuti periodik", "Akun nonaktif"].includes(x.reason ?? "");
                  return (
                    <tr key={u.id} className={cn(u.status === "BREAKDOWN" && "opacity-50", !a && u.status === "OPERASI" && "bg-red-50/40")}>
                      <td>
                        <p className="font-mono font-bold">{u.code}</p>
                        <p className="text-xs text-gray-500">{unitCategoryLabel(u.category)} · {u.model}</p>
                      </td>
                      <td className="whitespace-nowrap text-sm">{u.fleet?.code ?? "-"}<span className="text-gray-400"> / </span>{u.pit?.code ?? "-"}</td>
                      <td><Badge tone={us.tone}>{us.label}</Badge></td>
                      <td>
                        {a ? (
                          <div>
                            <p className={cn("font-semibold", problem && "text-brand")}>{a.personnel.name}</p>
                            <p className="text-xs text-gray-500">{a.personnel.employeeNo}{problem && ` · ${x?.reason}`}</p>
                          </div>
                        ) : u.status === "OPERASI" ? (
                          <span className="text-sm font-medium text-brand">Belum ada operator</span>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td>{a && <Badge tone={STATUS_BADGE[a.status].tone}>{STATUS_BADGE[a.status].label}</Badge>}</td>
                      <td>
                        {u.status !== "BREAKDOWN" && (
                          <div className="flex justify-end gap-1">
                            <Dialog
                              title={a ? (a.status !== "DRAFT" ? `Quick Replacement — ${u.code}` : `Ganti Operator — ${u.code}`) : `Tetapkan Operator — ${u.code}`}
                              description={`${unitCategoryLabel(u.category)} · ${formatDate(date)} · Shift ${shift === "PAGI" ? "Pagi" : "Malam"}`}
                              trigger={a ? <><RefreshCw className="h-3.5 w-3.5" /> {a.status !== "DRAFT" ? "Quick Replace" : "Ganti"}</> : <><UserPlus className="h-3.5 w-3.5" /> Tetapkan</>}
                              triggerClassName={a ? "btn-outline btn-sm" : "btn-navy btn-sm"}
                            >
                              <ActionForm action={assignOperator} className="space-y-4">
                                {common}
                                <input type="hidden" name="unitId" value={u.id} />
                                {a && <p className="rounded-lg bg-surface px-3 py-2 text-sm">Operator saat ini: <b>{a.personnel.name}</b></p>}
                                <Field label="Operator">
                                  <OperatorSelect avail={avail} category={u.category} current={a?.personnelId} />
                                </Field>
                                <Field label={a && a.status !== "DRAFT" ? "Alasan penggantian (wajib)" : "Keterangan"}>
                                  <input name="reason" className="input" placeholder="Mis. operator izin mendadak" required={!!a && a.status !== "DRAFT"} />
                                </Field>
                                <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" name="force" className="accent-brand" /> Abaikan peringatan (roster/skill berbeda)</label>
                                <div className="flex justify-end"><SubmitButton>Simpan</SubmitButton></div>
                              </ActionForm>
                            </Dialog>
                            {a && (
                              <ActionForm action={removeAssignment} confirm={`Hapus penugasan ${u.code}?`} showMessage={false}>
                                <input type="hidden" name="id" value={a.id} />
                                <SubmitButton className="btn-ghost btn-sm px-2 text-gray-400 hover:text-brand" pendingText="…"><Trash2 className="h-4 w-4" /></SubmitButton>
                              </ActionForm>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="self-start">
          <CardHeader title="Operator Standby" description="Tersedia sesuai roster, belum ditugaskan" />
          <ul className="max-h-[560px] divide-y divide-gray-50 overflow-y-auto">
            {pool.length === 0 && <li className="px-5 py-6 text-center text-sm text-gray-400">Tidak ada operator standby</li>}
            {pool.map((p) => (
              <li key={p.id} className="px-5 py-2.5">
                <p className="text-sm font-semibold">{p.name}</p>
                <p className="text-xs text-gray-500">{p.skills.map((s) => unitCategoryLabel(s).split(" (")[0]).join(", ")}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function Summary({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={cn("text-2xl font-bold", tone)}>{value}</p>
    </div>
  );
}

function OperatorSelect({ avail, category, current }: { avail: Availability[]; category: string; current?: string }) {
  const free = avail.filter((a) => a.id !== current);
  const match = free.filter((a) => a.available && !a.assignedUnit && a.skills.includes(category));
  const other = free.filter((a) => a.available && !a.assignedUnit && !a.skills.includes(category));
  const soft = free.filter((a) => !a.available && !a.assignedUnit && a.reason && ["Libur roster", "Roster Pagi", "Roster Malam", "Belum ada roster"].includes(a.reason));
  const blocked = free.filter((a) => a.assignedUnit || (!a.available && !soft.includes(a)));
  return (
    <select name="personnelId" className="input" required defaultValue="">
      <option value="" disabled>Pilih operator…</option>
      <optgroup label={`Tersedia — skill sesuai (${match.length})`}>
        {match.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.employeeNo}</option>)}
      </optgroup>
      <optgroup label={`Tersedia — skill lain (${other.length})`}>
        {other.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.skills.map((s) => unitCategoryLabel(s).split(" (")[0]).join("/")}</option>)}
      </optgroup>
      <optgroup label="Di luar roster (perlu konfirmasi)">
        {soft.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.reason}</option>)}
      </optgroup>
      <optgroup label="Tidak tersedia">
        {blocked.map((a) => <option key={a.id} value={a.id} disabled>{a.name} — {a.assignedUnit ? `bertugas di ${a.assignedUnit}` : a.reason}</option>)}
      </optgroup>
    </select>
  );
}
