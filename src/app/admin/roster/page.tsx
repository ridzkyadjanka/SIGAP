import Link from "next/link";
import { ChevronLeft, ChevronRight, Wand2, PencilLine, ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { PageHeader, Card, Tabs, Badge, Field } from "@/components/ui";
import type { Personnel, Pit } from "@/db/schema";
import { Dialog } from "@/components/client/dialog";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { FilterForm } from "@/components/client/auto-submit";
import { PeoplePicker } from "@/components/client/people-picker";
import { RosterStartPreview } from "@/components/client/roster-preview";
import { buildPattern, loadRosterContext, rosterFor, estimateLeave } from "@/lib/roster";
import { getSetting } from "@/lib/settings";
import { GL_TYPES, ROSTER_CODES, UNIT_CATEGORIES, glTypeLabel, unitCategoryLabel } from "@/lib/constants";
import { dayName, dayOfWeek, formatDate, monthLabel, monthRange, parseMonthParam, shiftMonth, todayStr } from "@/lib/dates";
import { generateRoster, manualRoster } from "./actions";
import { cn } from "@/components/ui";

export const metadata = { title: "Roster & Jadwal" };

export default async function RosterPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const cat = sp.cat === "GROUP_LEADER" ? "GROUP_LEADER" : "OPERATOR";
  const { year, month } = parseMonthParam(sp.month);
  const { days } = monthRange(year, month);
  const today = todayStr();
  const patternSetting = await getSetting("roster_pattern");
  const pattern = buildPattern(patternSetting);
  const pitList = await db.query.pits.findMany({ orderBy: (p, { asc }) => asc(p.code) });

  let people = await db.query.personnel.findMany({
    where: (p, { and, eq, ne }) => and(eq(p.category, cat), ne(p.workStatus, "RESIGN")),
    with: { pit: true },
    orderBy: (p, { asc }) => asc(p.name),
  });
  const allPeople = people;
  const q = (sp.q ?? "").toLowerCase();
  if (q) people = people.filter((p) => p.name.toLowerCase().includes(q) || p.employeeNo.toLowerCase().includes(q));
  if (sp.pit) people = people.filter((p) => p.pitId === sp.pit);
  if (sp.skill) people = people.filter((p) => p.skills.includes(sp.skill!) || p.glType === sp.skill);

  const selected = sp.person ? allPeople.find((p) => p.id === sp.person) : undefined;
  const ctx = await loadRosterContext(selected ? [selected.id] : people.map((p) => p.id));
  const keep = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams(
      Object.entries({ cat, month: sp.month, q: sp.q, pit: sp.pit, skill: sp.skill, person: sp.person, ...extra }).filter(([, v]) => v) as [string, string][]
    );
    return `/admin/roster?${params}`;
  };
  const pickList = allPeople.map((p) => ({
    id: p.id,
    name: p.name,
    employeeNo: p.employeeNo,
    sub: cat === "OPERATOR" ? p.skills.map((s) => unitCategoryLabel(s).split(" (")[0]).join(", ") : glTypeLabel(p.glType),
  }));
  const prefill = selected ? [selected.id] : [];

  const legend = (
    <div className="flex flex-wrap gap-3 text-xs">
      {Object.entries(ROSTER_CODES).map(([k, v]) => (
        <span key={k} className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded-sm ${v.dot}`} /> {v.label}</span>
      ))}
      <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm ring-2 ring-navy ring-offset-1" /> Diubah manual</span>
    </div>
  );

  return (
    <>
      <PageHeader
        title={cat === "OPERATOR" ? "Roster Operator" : "Roster Group Leader"}
        description={`Pola: ${patternSetting.morning} Pagi – ${patternSetting.night} Malam – ${patternSetting.off} Libur (siklus ${pattern.length} hari). Tanggal roster = tanggal mulai shift.`}
        actions={
          <>
            <Dialog title="Buat Roster Otomatis" description="Tetapkan Hari ke-1 siklus untuk personel terpilih. Sistem membentuk roster sesuai pola." trigger={<><Wand2 className="h-4 w-4" /> Buat Roster Otomatis</>} size="lg">
              <ActionForm action={generateRoster} className="space-y-4">
                <PeoplePicker people={pickList} defaultSelected={prefill} />
                <RosterStartPreview pattern={pattern} defaultDate={today} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="clearManual" className="accent-brand" /> Hapus perubahan manual mulai tanggal tersebut</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="force" className="accent-brand" /> Tetap simpan walaupun ada benturan penugasan</label>
                <div className="flex justify-end"><SubmitButton>Simpan Roster</SubmitButton></div>
              </ActionForm>
            </Dialog>
            <Dialog title="Ubah Jadwal Manual" description="Menimpa pola otomatis pada rentang tanggal tertentu." trigger={<><PencilLine className="h-4 w-4" /> Ubah Manual</>} triggerClassName="btn-outline" size="lg">
              <ActionForm action={manualRoster} className="space-y-4">
                <PeoplePicker people={pickList} defaultSelected={prefill} />
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Dari tanggal"><input type="date" name="start" defaultValue={today} className="input" required /></Field>
                  <Field label="Sampai tanggal"><input type="date" name="end" defaultValue={today} className="input" required /></Field>
                  <Field label="Jadwal">
                    <select name="code" className="input">
                      <option value="P">Shift Pagi</option>
                      <option value="M">Shift Malam</option>
                      <option value="L">Libur</option>
                      <option value="AUTO">Kembalikan ke pola otomatis</option>
                    </select>
                  </Field>
                </div>
                <Field label="Keterangan"><input name="note" className="input" placeholder="Mis. tukar shift, kebutuhan operasional" /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="force" className="accent-brand" /> Tetap simpan walaupun ada benturan penugasan</label>
                <div className="flex justify-end"><SubmitButton>Simpan Perubahan</SubmitButton></div>
              </ActionForm>
            </Dialog>
          </>
        }
      />
      <Tabs
        active={cat}
        items={[
          { key: "OPERATOR", label: "Roster Operator", href: "/admin/roster?cat=OPERATOR" },
          { key: "GROUP_LEADER", label: "Roster Group Leader", href: "/admin/roster?cat=GROUP_LEADER" },
          { key: "TEMPLATE", label: "Template Shift", href: "/admin/roster/shift" },
        ]}
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <Link href={keep({ month: shiftMonth(year, month, -1) })} className="btn-outline btn-sm px-2" aria-label="Bulan sebelumnya"><ChevronLeft className="h-4 w-4" /></Link>
            <span className="min-w-36 text-center font-bold">{monthLabel(year, month)}</span>
            <Link href={keep({ month: shiftMonth(year, month, 1) })} className="btn-outline btn-sm px-2" aria-label="Bulan berikutnya"><ChevronRight className="h-4 w-4" /></Link>
            <Link href={keep({ month: undefined })} className="btn-ghost btn-sm">Bulan ini</Link>
          </div>
          {!selected && (
            <FilterForm className="flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="cat" value={cat} />
              {sp.month && <input type="hidden" name="month" value={sp.month} />}
              <input name="q" data-noauto defaultValue={sp.q} placeholder="Cari nama…" className="input sm:w-48" />
              <select name="pit" defaultValue={sp.pit ?? ""} className="input sm:w-40">
                <option value="">Semua PIT</option>
                {pitList.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
              </select>
              <select name="skill" defaultValue={sp.skill ?? ""} className="input sm:w-44">
                <option value="">{cat === "OPERATOR" ? "Semua skill" : "Semua jenis GL"}</option>
                {(cat === "OPERATOR" ? UNIT_CATEGORIES : GL_TYPES).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <button className="btn-navy btn-sm">Filter</button>
            </FilterForm>
          )}
        </div>
        <div className="border-b border-gray-100 px-4 py-3">{legend}</div>

        {selected ? (
          <PersonCalendar person={selected} ctx={ctx} days={days} today={today} back={keep({ person: undefined })} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-48 border-b border-r border-gray-200 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-500">Personel ({people.length})</th>
                  {days.map((d) => (
                    <th key={d} className={cn("min-w-8 border-b border-gray-200 px-0.5 py-1 text-center font-semibold", d === today ? "bg-brand text-white" : dayOfWeek(d) === 0 ? "bg-red-50 text-brand" : "bg-gray-50 text-gray-500")}>
                      <div>{Number(d.slice(8))}</div>
                      <div className="text-[9px] font-normal opacity-80">{dayName(d, true)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const r = rosterFor(p, ctx, days);
                  return (
                    <tr key={p.id} className="group">
                      <td className="sticky left-0 z-10 border-b border-r border-gray-100 bg-white px-3 py-1.5 group-hover:bg-gray-50">
                        <Link href={keep({ person: p.id })} className="font-semibold text-navy hover:text-brand">{p.name}</Link>
                        <div className="text-[10px] text-gray-400">{p.employeeNo} · {p.pit?.code ?? "-"}</div>
                      </td>
                      {r.map((c) => (
                        <td key={c.date} className={cn("border-b border-gray-100 p-0.5 text-center", c.date === today && "bg-brand/5")}>
                          <span className={cn("block rounded border py-1 font-bold", ROSTER_CODES[c.code].className, c.manual && "ring-2 ring-navy ring-offset-0")} title={`${formatDate(c.date)} — ${ROSTER_CODES[c.code].label}${c.manual ? " (manual)" : ""}`}>
                            {c.code}
                          </span>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {people.length === 0 && <p className="p-8 text-center text-sm text-gray-400">Tidak ada personel</p>}
          </div>
        )}
      </Card>
    </>
  );
}

async function PersonCalendar({
  person,
  ctx,
  days,
  today,
  back,
}: {
  person: Personnel & { pit: Pit | null };
  ctx: Awaited<ReturnType<typeof loadRosterContext>>;
  days: string[];
  today: string;
  back: string;
}) {
  const r = rosterFor(person, ctx, days);
  const lead = (dayOfWeek(days[0]) + 6) % 7; // Senin sebagai awal minggu
  const est = estimateLeave(person, ctx, await getSetting("leave_rules"), today);
  const counts = { P: 0, M: 0, L: 0, C: 0 } as Record<string, number>;
  r.forEach((c) => (counts[c.code] = (counts[c.code] ?? 0) + 1));
  return (
    <div className="grid gap-6 p-4 lg:grid-cols-[1fr_300px]">
      <div>
        <Link href={back} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-navy"><ArrowLeft className="h-4 w-4" /> Semua personel</Link>
        <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-gray-500">
          {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => <div key={d}>{d}</div>)}
          {Array.from({ length: lead }).map((_, i) => <div key={`x${i}`} />)}
          {r.map((c) => (
            <div key={c.date} className={cn("rounded-lg border p-2 text-left", ROSTER_CODES[c.code].className, c.date === today && "ring-2 ring-brand", c.manual && "outline outline-2 outline-navy")}>
              <div className="text-xs font-bold">{Number(c.date.slice(8))}</div>
              <div className="mt-1 truncate text-[11px] font-semibold">{ROSTER_CODES[c.code].label}</div>
            </div>
          ))}
        </div>
      </div>
      <CardLike>
        <p className="text-lg font-bold">{person.name}</p>
        <p className="text-xs text-gray-500">{person.employeeNo} · {person.position} · {person.pit?.name ?? "-"}</p>
        <dl className="mt-4 space-y-2 text-sm">
          <Row k="Mulai siklus" v={formatDate(person.cycleStartDate)} />
          <Row k="Hari kerja bulan ini" v={`${(counts.P ?? 0) + (counts.M ?? 0)} hari`} />
          <Row k="Pagi / Malam / Libur" v={`${counts.P ?? 0} / ${counts.M ?? 0} / ${counts.L ?? 0}`} />
          <Row k="Cuti bulan ini" v={`${counts.C ?? 0} hari`} />
        </dl>
        <div className="mt-4 rounded-lg bg-orange-50 p-3 text-sm">
          <p className="font-semibold text-orange-800">{est.onLeave ? "Sedang cuti periodik" : est.scheduled ? "Cuti periodik dijadwalkan" : "Estimasi cuti periodik"}</p>
          <p className="text-orange-900">{formatDate(est.startDate)} – {formatDate(est.endDate)}</p>
          {!est.onLeave && <p className="mt-1 text-xs text-orange-700">Hari kerja: {est.workdaysDone}/{est.requiredWorkdays}</p>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="navy">{person.category === "OPERATOR" ? "Operator" : glTypeLabel(person.glType)}</Badge>
        </div>
      </CardLike>
    </div>
  );
}

function CardLike({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-gray-200 p-4">{children}</div>;
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-gray-500">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}

