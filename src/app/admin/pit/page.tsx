import { Plus, Pencil, MapPin, Truck, Users, Layers, ArrowDownToLine, ArrowUpFromLine, ShieldCheck } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assignments } from "@/db/schema";
import { PageHeader, Card, Badge, EmptyState, Field } from "@/components/ui";
import { Dialog } from "@/components/client/dialog";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { glTypeLabel } from "@/lib/constants";
import { todayStr } from "@/lib/dates";
import { savePit } from "./actions";
import type { Fleet, Personnel, Pit } from "@/db/schema";

export const metadata = { title: "Lokasi / PIT" };

export default async function PitPage() {
  const today = todayStr();
  const pitList = await db.query.pits.findMany({ with: { leader: true, fleets: true, units: true }, orderBy: (p, { asc }) => asc(p.code) });
  const fleetList = await db.query.fleets.findMany({ orderBy: (f, { asc }) => asc(f.code) });
  const gls = await db.query.personnel.findMany({ where: (p, { and, eq, ne }) => and(eq(p.category, "GROUP_LEADER"), ne(p.workStatus, "RESIGN")), orderBy: (p, { asc }) => asc(p.name) });
  const people = await db.query.personnel.findMany({ columns: { id: true, pitId: true, category: true, workStatus: true } });
  const asg = await db.select({ pitId: assignments.pitId, shift: assignments.shift }).from(assignments).where(eq(assignments.date, today));

  return (
    <>
      <PageHeader
        title="Lokasi / PIT Management"
        description="Kelola lokasi kerja, loading & dumping point, fleet, dan Group Leader penanggung jawab."
        actions={
          <Dialog title="Tambah PIT" trigger={<><Plus className="h-4 w-4" /> Tambah PIT</>} size="lg">
            <PitForm fleets={fleetList} gls={gls} />
          </Dialog>
        }
      />
      {pitList.length === 0 ? (
        <Card><EmptyState title="Belum ada lokasi kerja" /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {pitList.map((p) => {
            const ops = people.filter((x) => x.pitId === p.id && x.category === "OPERATOR" && x.workStatus !== "RESIGN").length;
            const todayPagi = asg.filter((a) => a.pitId === p.id && a.shift === "PAGI").length;
            const todayMalam = asg.filter((a) => a.pitId === p.id && a.shift === "MALAM").length;
            return (
              <Card key={p.id} className="overflow-hidden">
                <div className="bg-navy px-5 py-4 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold text-white/60">{p.code}</p>
                      <p className="text-lg font-bold">{p.name}</p>
                    </div>
                    <Dialog title={`Edit ${p.code}`} trigger={<Pencil className="h-4 w-4" />} triggerClassName="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white" size="lg">
                      <PitForm fleets={fleetList} gls={gls} pit={p} />
                    </Dialog>
                  </div>
                  {p.description && <p className="mt-1 text-xs text-white/60">{p.description}</p>}
                </div>
                <div className="space-y-2 px-5 py-4 text-sm">
                  <p className="flex items-center gap-2"><ArrowUpFromLine className="h-4 w-4 text-gray-400" /> Loading: <b>{p.loadingPoint ?? "-"}</b></p>
                  <p className="flex items-center gap-2"><ArrowDownToLine className="h-4 w-4 text-gray-400" /> Dumping: <b>{p.dumpingPoint ?? "-"}</b></p>
                  <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-gray-400" /> PJ: <b>{p.leader ? `${p.leader.name} (${glTypeLabel(p.leader.glType)})` : "-"}</b></p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {p.fleets.map((f) => <Badge key={f.id} tone="navy">{f.code}</Badge>)}
                    {p.fleets.length === 0 && <span className="text-xs text-gray-400">Belum ada fleet</span>}
                  </div>
                </div>
                <div className="grid grid-cols-4 divide-x divide-gray-100 border-t border-gray-100 text-center">
                  <Stat icon={<Layers className="h-4 w-4" />} v={p.fleets.length} l="Fleet" />
                  <Stat icon={<Truck className="h-4 w-4" />} v={p.units.length} l="Unit" />
                  <Stat icon={<Users className="h-4 w-4" />} v={ops} l="Operator" />
                  <Stat icon={<MapPin className="h-4 w-4" />} v={`${todayPagi}/${todayMalam}`} l="Tugas P/M" />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function Stat({ icon, v, l }: { icon: React.ReactNode; v: React.ReactNode; l: string }) {
  return (
    <div className="px-2 py-3">
      <div className="flex justify-center text-gray-400">{icon}</div>
      <p className="mt-1 font-bold">{v}</p>
      <p className="text-[11px] text-gray-500">{l}</p>
    </div>
  );
}

function PitForm({ fleets, gls, pit }: { fleets: Fleet[]; gls: Personnel[]; pit?: Pit & { fleets: Fleet[] } }) {
  return (
    <ActionForm action={savePit} className="space-y-4" resetOnSuccess={!pit}>
      {pit && <input type="hidden" name="id" value={pit.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kode PIT"><input name="code" defaultValue={pit?.code} className="input uppercase" placeholder="PIT-D" required /></Field>
        <Field label="Nama PIT"><input name="name" defaultValue={pit?.name} className="input" required /></Field>
        <Field label="Lokasi Loading"><input name="loadingPoint" defaultValue={pit?.loadingPoint ?? ""} className="input" /></Field>
        <Field label="Lokasi Dumping"><input name="dumpingPoint" defaultValue={pit?.dumpingPoint ?? ""} className="input" /></Field>
        <Field label="Group Leader Penanggung Jawab" className="sm:col-span-2">
          <select name="leaderId" defaultValue={pit?.leaderId ?? ""} className="input">
            <option value="">— Belum ditentukan —</option>
            {gls.map((g) => <option key={g.id} value={g.id}>{g.name} — {glTypeLabel(g.glType)}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Deskripsi"><input name="description" defaultValue={pit?.description ?? ""} className="input" /></Field>
      <fieldset>
        <legend className="label">Fleet yang beroperasi di PIT ini</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {fleets.map((f) => (
            <label key={f.id} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <input type="checkbox" name="fleetIds" value={f.id} defaultChecked={pit?.fleets.some((x) => x.id === f.id)} className="accent-brand" />
              {f.code}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-500">Mencentang fleet dari PIT lain akan memindahkan fleet beserta unitnya (tercatat di riwayat).</p>
      </fieldset>
      <div className="flex justify-end"><SubmitButton>{pit ? "Simpan" : "Tambah PIT"}</SubmitButton></div>
    </ActionForm>
  );
}
