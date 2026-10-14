import Link from "next/link";
import { BellRing, Search, Settings, CheckCircle2 } from "lucide-react";
import { db } from "@/db";
import { PageHeader, Card, Badge, EmptyState, cn } from "@/components/ui";
import { estimateAllLeaves } from "@/lib/roster";
import { getSetting } from "@/lib/settings";
import { daysLabel, lastUnitOf } from "@/lib/operations";
import { formatDate, todayStr } from "@/lib/dates";
import { glTypeLabel, unitCategoryLabel } from "@/lib/constants";

export const metadata = { title: "Early Warning" };

const TIER_INFO: Record<number, string> = {
  30: "Persiapan rencana cuti",
  14: "Perencanaan manpower pengganti",
  7: "Pemeriksaan kesiapan pengganti",
  3: "Peringatan mendesak",
  1: "Konfirmasi penugasan pengganti",
};

export default async function EarlyWarningPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const today = todayStr();
  const thresholds = [...(await getSetting("warning_days"))].sort((a, b) => a - b);
  const max = thresholds[thresholds.length - 1] ?? 30;
  const all = await estimateAllLeaves(today);
  let rows = all.filter((x) => !x.estimate.onLeave && x.estimate.daysUntil <= max).sort((a, b) => a.estimate.daysUntil - b.estimate.daysUntil);
  if (sp.cat) rows = rows.filter((r) => r.person.category === sp.cat);
  const reps = await db.query.replacements.findMany({ with: { leave: true, replacementPersonnel: true } });
  const enriched = await Promise.all(
    rows.map(async (r) => ({
      ...r,
      tier: thresholds.find((t) => r.estimate.daysUntil <= t),
      last: r.person.category === "OPERATOR" ? await lastUnitOf(r.person.id) : null,
      rep: reps.find((x) => x.leave.personnelId === r.person.id && x.leave.startDate === r.estimate.startDate),
    }))
  );

  return (
    <>
      <PageHeader
        title="Early Warning System — Cuti Periodik"
        description="Sistem menghitung estimasi cuti dan memberi peringatan dini agar Admin Manpower dapat menyiapkan tenaga kerja pengganti."
        actions={<Link href="/admin/pengaturan#notifikasi" className="btn-outline"><Settings className="h-4 w-4" /> Atur Interval</Link>}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[...thresholds].reverse().map((t) => {
          const n = enriched.filter((e) => e.tier === t).length;
          return (
            <div key={t} className={cn("card p-4", t <= 3 && n > 0 && "border-red-200 bg-red-50")}>
              <p className="text-xs font-bold text-brand">H-{t}</p>
              <p className="text-2xl font-bold">{n}</p>
              <p className="text-xs text-gray-500">{TIER_INFO[t] ?? "Peringatan"}</p>
            </div>
          );
        })}
      </div>
      <div className="mb-4 flex gap-2">
        {[["", "Semua"], ["OPERATOR", "Operator"], ["GROUP_LEADER", "Group Leader"]].map(([v, l]) => (
          <Link key={v} href={v ? `/admin/early-warning?cat=${v}` : "/admin/early-warning"} className={cn("rounded-full px-4 py-1.5 text-sm font-semibold", (sp.cat ?? "") === v ? "bg-navy text-white" : "bg-white text-gray-600 ring-1 ring-gray-200")}>{l}</Link>
        ))}
      </div>
      {enriched.length === 0 ? (
        <Card><EmptyState title={`Tidak ada cuti periodik dalam ${max} hari ke depan`} /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {enriched.map(({ person, estimate, tier, last, rep }) => (
            <Card key={person.id} className={cn("overflow-hidden", sp.person === person.id && "ring-2 ring-brand")}>
              <div className={cn("flex items-center gap-2 px-5 py-2.5 text-sm font-bold", (tier ?? 99) <= 3 ? "bg-brand text-white" : (tier ?? 99) <= 7 ? "bg-orange-100 text-orange-800" : "bg-navy-soft text-navy")}>
                <BellRing className="h-4 w-4" /> Periodic Leave Alert · {daysLabel(estimate.daysUntil)}
                <span className="ml-auto text-xs font-medium opacity-80">{tier ? TIER_INFO[tier] : ""}</span>
              </div>
              <div className="p-5">
                <p className="text-sm text-gray-700">
                  {person.category === "OPERATOR" ? "Operator" : glTypeLabel(person.glType)} <b className="text-navy">{person.name}</b> akan memasuki cuti periodik
                  {estimate.daysUntil === 0 ? " hari ini" : ` dalam ${estimate.daysUntil} hari`}.
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-gray-500">Periode</dt>
                  <dd className="font-semibold">{formatDate(estimate.startDate, { short: true })} – {formatDate(estimate.endDate, { short: true })}{!estimate.scheduled && <span className="ml-1 text-xs font-normal text-gray-400">(estimasi)</span>}</dd>
                  <dt className="text-gray-500">Unit terakhir</dt>
                  <dd className="font-semibold">{last ? `${last.code} (${last.model})` : "-"}</dd>
                  <dt className="text-gray-500">Lokasi</dt>
                  <dd className="font-semibold">{person.pit?.name ?? "-"}</dd>
                  <dt className="text-gray-500">Skill</dt>
                  <dd className="font-semibold">{person.category === "OPERATOR" ? person.skills.map(unitCategoryLabel).join(", ") : glTypeLabel(person.glType)}</dd>
                  <dt className="text-gray-500">Status Pengganti</dt>
                  <dd>{rep ? <Badge tone="green"><CheckCircle2 className="h-3 w-3" /> {rep.replacementPersonnel.name}</Badge> : <Badge tone="red">Belum Ditentukan</Badge>}</dd>
                </dl>
                <div className="mt-4 flex justify-end">
                  <Link href={`/admin/early-warning/pengganti?person=${person.id}`} className={rep ? "btn-outline btn-sm" : "btn-primary btn-sm"}>
                    <Search className="h-4 w-4" /> {rep ? "Lihat / Ubah Pengganti" : "Cari Pengganti"}
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
