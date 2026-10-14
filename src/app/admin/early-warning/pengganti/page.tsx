import Link from "next/link";
import { ArrowLeft, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { db } from "@/db";
import { PageHeader, Card, CardHeader, Badge, EmptyState, Field } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { estimateAllLeaves, estimateLeave, loadRosterContext } from "@/lib/roster";
import { getSetting } from "@/lib/settings";
import { daysLabel, lastUnitOf, replacementCandidates } from "@/lib/operations";
import { formatDate, isValidDate, todayStr } from "@/lib/dates";
import { ROSTER_CODES, UNIT_CATEGORIES, glTypeLabel, unitCategoryLabel } from "@/lib/constants";
import { deleteReplacement, saveReplacement } from "../actions";

export const metadata = { title: "Replacement Planning" };

export default async function ReplacementPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const today = todayStr();
  const target = sp.person ? await db.query.personnel.findFirst({ where: (p, { eq }) => eq(p.id, sp.person), with: { pit: true } }) : null;

  const allReps = await db.query.replacements.findMany({ with: { leave: { with: { personnel: true } }, replacementPersonnel: true }, orderBy: (r, { desc }) => desc(r.startDate) });

  if (!target) {
    const upcoming = (await estimateAllLeaves(today)).filter((x) => x.estimate.daysUntil <= 45).sort((a, b) => a.estimate.daysUntil - b.estimate.daysUntil);
    return (
      <>
        <PageHeader title="Replacement Planning" description="Pilih personel yang akan cuti untuk mencari kandidat pengganti." />
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Membutuhkan pengganti (≤ 45 hari)" />
            <ul className="divide-y divide-gray-100">
              {upcoming.map(({ person, estimate }) => {
                const has = allReps.some((r) => r.leave.personnelId === person.id && r.endDate >= today);
                return (
                  <li key={person.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex-1">
                      <p className="font-semibold">{person.name}</p>
                      <p className="text-xs text-gray-500">{person.category === "OPERATOR" ? "Operator" : glTypeLabel(person.glType)} · {formatDate(estimate.startDate, { short: true })} – {formatDate(estimate.endDate, { short: true })}</p>
                    </div>
                    {estimate.onLeave ? <Badge tone="orange">Sedang cuti</Badge> : <Badge tone={estimate.daysUntil <= 7 ? "red" : "blue"}>{daysLabel(estimate.daysUntil)}</Badge>}
                    {has ? <Badge tone="green">Ada pengganti</Badge> : null}
                    <Link href={`?person=${person.id}`} className="btn-outline btn-sm">Pilih</Link>
                  </li>
                );
              })}
            </ul>
          </Card>
          <ReplacementList reps={allReps} />
        </div>
      </>
    );
  }

  const ctx = await loadRosterContext([target.id]);
  const est = estimateLeave(target, ctx, await getSetting("leave_rules"), today);
  const start = isValidDate(sp.start) ? sp.start : est.startDate;
  const end = isValidDate(sp.end) ? sp.end : est.endDate;
  const last = target.category === "OPERATOR" ? await lastUnitOf(target.id) : null;
  const skill = target.category === "OPERATOR" ? sp.skill ?? last?.category ?? target.skills[0] ?? null : null;
  const candidates = await replacementCandidates({ personId: target.id, start, end, skill });
  const unitList = await db.query.units.findMany({ orderBy: (u, { asc }) => asc(u.code) });
  const reps = allReps.filter((r) => r.leave.personnelId === target.id);

  return (
    <>
      <Link href="/admin/early-warning" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-navy"><ArrowLeft className="h-4 w-4" /> Early Warning</Link>
      <PageHeader title={`Cari Pengganti — ${target.name}`} description="Kandidat disaring berdasarkan kesesuaian skill, ketersediaan periode, status cuti/sakit, libur roster, dan benturan penugasan." />

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <p className="text-xs font-bold uppercase text-brand">{est.scheduled ? "Cuti terjadwal" : "Estimasi cuti"}</p>
            <p className="mt-1 text-lg font-bold">{target.name}</p>
            <p className="text-xs text-gray-500">{target.employeeNo} · {target.category === "OPERATOR" ? "Operator" : glTypeLabel(target.glType)} · {target.pit?.name ?? "-"}</p>
            <dl className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Periode</dt><dd className="font-semibold">{formatDate(est.startDate, { short: true })} – {formatDate(est.endDate, { short: true })}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Sisa waktu</dt><dd className="font-semibold">{est.onLeave ? "Sedang cuti" : daysLabel(est.daysUntil)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Unit terakhir</dt><dd className="font-semibold">{last?.code ?? "-"}</dd></div>
            </dl>
          </Card>
          <Card className="p-5">
            <form className="space-y-3">
              <input type="hidden" name="person" value={target.id} />
              <Field label="Periode penugasan dari"><input type="date" name="start" defaultValue={start} className="input" /></Field>
              <Field label="Sampai"><input type="date" name="end" defaultValue={end} className="input" /></Field>
              {target.category === "OPERATOR" && (
                <Field label="Skill yang dibutuhkan">
                  <select name="skill" defaultValue={skill ?? ""} className="input">
                    {UNIT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </Field>
              )}
              <button className="btn-navy w-full">Perbarui Kandidat</button>
            </form>
          </Card>
          <ReplacementList reps={reps} />
        </div>

        <Card>
          <CardHeader title={`Kandidat Pengganti (${candidates.filter((c) => c.eligible).length} memenuhi syarat)`} description={`${formatDate(start)} – ${formatDate(end)}${skill ? ` · Skill: ${unitCategoryLabel(skill)}` : ""}`} />
          {candidates.length === 0 ? (
            <EmptyState title="Tidak ada kandidat dengan skill sesuai" />
          ) : (
            <ActionForm action={saveReplacement} className="p-0" confirm="Review: simpan kandidat terpilih sebagai pengganti? Sistem tidak menetapkan pengganti tanpa persetujuan Anda.">
              <input type="hidden" name="personId" value={target.id} />
              <input type="hidden" name="start" value={start} />
              <input type="hidden" name="end" value={end} />
              {skill && <input type="hidden" name="skill" value={skill} />}
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th /><th>Kandidat</th><th>Lokasi</th><th>Roster awal</th><th>Hari kerja di periode</th><th>Kelayakan</th></tr></thead>
                  <tbody>
                    {candidates.map((c) => (
                      <tr key={c.id} className={c.eligible ? "" : "opacity-60"}>
                        <td><input type="radio" name="candidateId" value={c.id} className="accent-brand" /></td>
                        <td><p className="font-semibold">{c.name}</p><p className="text-xs text-gray-500">{c.employeeNo} · {c.skills.map((s) => unitCategoryLabel(s).split(" (")[0]).join(", ")}</p></td>
                        <td className="text-sm">{c.pitName ?? "-"}</td>
                        <td><span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${ROSTER_CODES[c.startCode].className}`}>{ROSTER_CODES[c.startCode].label}</span></td>
                        <td className="tabular-nums">{c.workdaysInPeriod}/{c.totalDays}</td>
                        <td>
                          {c.eligible ? <Badge tone="green"><CheckCircle2 className="h-3 w-3" /> Memenuhi</Badge> : (
                            <div className="space-y-1">{c.conflicts.map((x) => <Badge key={x} tone="red"><XCircle className="h-3 w-3" /> {x}</Badge>)}</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-4 border-t border-gray-100 p-5 sm:grid-cols-2">
                <Field label="Unit yang dipegang pengganti">
                  <select name="unitCode" defaultValue={last?.code ?? ""} className="input">
                    <option value="">— Tidak spesifik —</option>
                    {unitList.map((u) => <option key={u.id} value={u.code}>{u.code} — {u.model}</option>)}
                  </select>
                </Field>
                <Field label="Catatan"><input name="note" className="input" /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="createDrafts" defaultChecked className="accent-brand" /> Buat draft penugasan harian sesuai roster pengganti</label>
                <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" name="force" className="accent-brand" /> Abaikan kendala kelayakan</label>
              </div>
              <div className="flex justify-end px-5 pb-5"><SubmitButton>Review & Simpan Pengganti</SubmitButton></div>
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  );
}

type Rep = { id: string; startDate: string; endDate: string; unitCode: string | null; replacementPersonnel: { name: string }; leave: { personnel: { name: string } } };

function ReplacementList({ reps }: { reps: Rep[] }) {
  return (
    <Card>
      <CardHeader title="Pengganti yang sudah ditetapkan" />
      {reps.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-gray-400">Belum ada</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {reps.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <div className="flex-1">
                <p><b>{r.replacementPersonnel.name}</b> menggantikan {r.leave.personnel.name}</p>
                <p className="text-xs text-gray-500">{formatDate(r.startDate, { short: true })} – {formatDate(r.endDate, { short: true })}{r.unitCode ? ` · ${r.unitCode}` : ""}</p>
              </div>
              <ActionForm action={deleteReplacement} confirm="Batalkan pengganti ini?" showMessage={false}>
                <input type="hidden" name="id" value={r.id} />
                <SubmitButton className="btn-ghost btn-sm px-2 text-gray-400 hover:text-brand" pendingText="…"><Trash2 className="h-4 w-4" /></SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
