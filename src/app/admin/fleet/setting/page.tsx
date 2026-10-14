import { Plus, Settings2, Trash2, MapPin } from "lucide-react";
import { db } from "@/db";
import { PageHeader, Card, Badge, EmptyState, Field } from "@/components/ui";
import { Dialog } from "@/components/client/dialog";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { unitCategoryLabel } from "@/lib/constants";
import { saveFleet, deleteFleet } from "../actions";
import type { Fleet, Pit, Unit } from "@/db/schema";

export const metadata = { title: "Setting Fleet" };

export default async function FleetSettingPage() {
  const pitList = await db.query.pits.findMany({ orderBy: (p, { asc }) => asc(p.code) });
  const fleetList = await db.query.fleets.findMany({ with: { pit: true, units: true }, orderBy: (f, { asc }) => asc(f.code) });
  const allUnits = await db.query.units.findMany({ with: { fleet: true }, orderBy: (u, { asc }) => asc(u.code) });

  return (
    <>
      <PageHeader
        title="Setting Fleet"
        description="Buat fleet, masukkan unit, tentukan lokasi loading, dan pindahkan fleet antar-PIT."
        actions={
          <Dialog title="Buat Fleet Baru" trigger={<><Plus className="h-4 w-4" /> Fleet Baru</>} size="lg">
            <FleetForm pits={pitList} units={allUnits} />
          </Dialog>
        }
      />
      {fleetList.length === 0 ? (
        <Card><EmptyState title="Belum ada fleet" /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {fleetList.map((f) => (
            <Card key={f.id} className="flex flex-col">
              <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
                <div>
                  <p className="font-mono text-xs font-semibold text-brand">{f.code}</p>
                  <p className="text-lg font-bold">{f.name}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-gray-500"><MapPin className="h-3 w-3" /> {f.pit?.name ?? "Belum ada PIT"} · Loading: {f.loadingPoint ?? "-"}</p>
                </div>
                <Badge tone="navy">{f.units.length} unit</Badge>
              </div>
              <ul className="flex-1 divide-y divide-gray-50 px-5 py-2 text-sm">
                {f.units.length === 0 && <li className="py-2 text-gray-400">Belum ada unit</li>}
                {f.units.map((u) => (
                  <li key={u.id} className="flex items-center justify-between py-1.5">
                    <span className="font-mono font-semibold">{u.code}</span>
                    <span className="text-xs text-gray-500">{unitCategoryLabel(u.category)} · {u.status}</span>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2 border-t border-gray-100 px-5 py-3">
                <Dialog title={`Konfigurasi ${f.code}`} trigger={<><Settings2 className="h-4 w-4" /> Konfigurasi</>} triggerClassName="btn-outline btn-sm flex-1" size="lg">
                  <FleetForm pits={pitList} units={allUnits} fleet={f} memberIds={f.units.map((u) => u.id)} />
                </Dialog>
                <ActionForm action={deleteFleet} confirm={`Hapus ${f.code}? Unit akan dilepas dari fleet.`} showMessage={false}>
                  <input type="hidden" name="id" value={f.id} />
                  <SubmitButton className="btn-danger btn-sm" pendingText="…"><Trash2 className="h-4 w-4" /></SubmitButton>
                </ActionForm>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function FleetForm({ pits, units, fleet, memberIds = [] }: { pits: Pit[]; units: (Unit & { fleet: Fleet | null })[]; fleet?: Fleet; memberIds?: string[] }) {
  return (
    <ActionForm action={saveFleet} className="space-y-4" resetOnSuccess={!fleet}>
      {fleet && <input type="hidden" name="id" value={fleet.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kode Fleet"><input name="code" defaultValue={fleet?.code} className="input uppercase" placeholder="FL-06" required /></Field>
        <Field label="Nama Fleet"><input name="name" defaultValue={fleet?.name} className="input" placeholder="Fleet 06" required /></Field>
        <Field label="Lokasi / PIT" hint="Mengubah PIT akan memindahkan seluruh unit di fleet ini.">
          <select name="pitId" defaultValue={fleet?.pitId ?? ""} className="input">
            <option value="">— Pilih PIT —</option>
            {pits.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Lokasi Loading"><input name="loadingPoint" defaultValue={fleet?.loadingPoint ?? ""} className="input" /></Field>
      </div>
      <fieldset>
        <legend className="label">Unit dalam fleet</legend>
        <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-gray-200 p-3 sm:grid-cols-3">
          {units.map((u) => (
            <label key={u.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="unitIds" value={u.id} defaultChecked={memberIds.includes(u.id)} className="accent-brand" />
              <span className="font-mono">{u.code}</span>
              {u.fleet && u.fleet.id !== fleet?.id && <span className="text-[10px] text-gray-400">({u.fleet.code})</span>}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-500">Unit yang sudah berada di fleet lain akan dipindahkan dan tercatat di riwayat.</p>
      </fieldset>
      <div className="flex justify-end"><SubmitButton>{fleet ? "Simpan Konfigurasi" : "Buat Fleet"}</SubmitButton></div>
    </ActionForm>
  );
}
