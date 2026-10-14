import { Plus, Pencil, History, Search } from "lucide-react";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { unitMovements } from "@/db/schema";
import { PageHeader, Card, CardHeader, Badge, EmptyState, Field } from "@/components/ui";
import { Dialog } from "@/components/client/dialog";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { FilterForm } from "@/components/client/auto-submit";
import { UNIT_CATEGORIES, UNIT_MODELS, UNIT_STATUS, unitCategoryLabel } from "@/lib/constants";
import { formatDateTime } from "@/lib/dates";
import { saveUnit, setUnitStatus } from "./actions";
import type { Fleet, Pit, Unit } from "@/db/schema";

export const metadata = { title: "Unit Alat Berat" };

export default async function UnitsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const pitList = await db.query.pits.findMany({ orderBy: (p, { asc }) => asc(p.code) });
  const fleetList = await db.query.fleets.findMany({ orderBy: (f, { asc }) => asc(f.code) });
  let rows = await db.query.units.findMany({ with: { pit: true, fleet: true }, orderBy: (u, { asc }) => asc(u.code) });
  const q = (sp.q ?? "").toLowerCase();
  if (q) rows = rows.filter((u) => u.code.toLowerCase().includes(q) || u.model.toLowerCase().includes(q));
  if (sp.category) rows = rows.filter((u) => u.category === sp.category);
  if (sp.status) rows = rows.filter((u) => u.status === sp.status);
  if (sp.pit) rows = rows.filter((u) => u.pitId === sp.pit);
  const moves = await db.query.unitMovements.findMany({ with: { unit: true }, orderBy: desc(unitMovements.createdAt), limit: 15 });

  return (
    <>
      <PageHeader
        title="Master Data Unit"
        description="Kelola alat berat, status operasional, fleet, dan lokasi PIT."
        actions={
          <Dialog title="Tambah Unit" trigger={<><Plus className="h-4 w-4" /> Tambah Unit</>} size="lg">
            <UnitForm pits={pitList} fleets={fleetList} />
          </Dialog>
        }
      />
      <div className="mb-4 grid grid-cols-3 gap-3">
        {UNIT_STATUS.map((s) => (
          <div key={s.value} className="card p-4">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="text-2xl font-bold">{rows.filter((u) => u.status === s.value).length}</p>
          </div>
        ))}
      </div>
      <Card>
        <FilterForm className="flex flex-col gap-3 border-b border-gray-100 p-4 md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input name="q" data-noauto defaultValue={sp.q} placeholder="Cari nomor unit atau model…" className="input pl-9" />
          </div>
          <select name="category" defaultValue={sp.category ?? ""} className="input md:w-48">
            <option value="">Semua jenis</option>
            {UNIT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select name="status" defaultValue={sp.status ?? ""} className="input md:w-40">
            <option value="">Semua status</option>
            {UNIT_STATUS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select name="pit" defaultValue={sp.pit ?? ""} className="input md:w-48">
            <option value="">Semua lokasi</option>
            {pitList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn-navy">Cari</button>
        </FilterForm>
        {rows.length === 0 ? (
          <EmptyState title="Unit tidak ditemukan" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>No. Unit</th><th>Jenis</th><th>Model</th><th>Fleet</th><th>Lokasi/PIT</th><th>Status</th><th>Keterangan</th><th className="text-right">Aksi</th></tr>
              </thead>
              <tbody>
                {rows.map((u) => {
                  const st = UNIT_STATUS.find((s) => s.value === u.status)!;
                  return (
                    <tr key={u.id}>
                      <td className="font-mono font-semibold">{u.code}</td>
                      <td>{unitCategoryLabel(u.category)}</td>
                      <td className="text-gray-600">{u.model}</td>
                      <td>{u.fleet ? <Badge tone="navy">{u.fleet.code}</Badge> : <span className="text-gray-400">-</span>}</td>
                      <td className="text-gray-600">{u.pit?.code ?? "-"}</td>
                      <td>
                        <ActionForm action={setUnitStatus} showMessage={false} className="inline">
                          <input type="hidden" name="id" value={u.id} />
                          <select name="status" defaultValue={u.status} className={`rounded-full border-0 px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${st.tone === "green" ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : st.tone === "orange" ? "bg-orange-50 text-orange-700 ring-orange-600/20" : "bg-red-50 text-red-700 ring-red-600/20"}`}>
                            {UNIT_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                          <SubmitButton className="ml-1 text-xs font-semibold text-gray-400 hover:text-navy" pendingText="…">Ubah</SubmitButton>
                        </ActionForm>
                      </td>
                      <td className="max-w-[200px] truncate text-xs text-gray-500">{u.notes ?? ""}</td>
                      <td className="text-right">
                        <Dialog title={`Edit Unit ${u.code}`} trigger={<Pencil className="h-4 w-4" />} triggerClassName="btn-ghost btn-sm px-2" size="lg">
                          <UnitForm pits={pitList} fleets={fleetList} unit={u} />
                        </Dialog>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title={<span className="flex items-center gap-2"><History className="h-4 w-4" /> Riwayat Perpindahan Unit</span>} description="15 perpindahan terakhir antar-fleet / PIT" />
        {moves.length === 0 ? (
          <EmptyState title="Belum ada riwayat perpindahan" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Waktu</th><th>Unit</th><th>Fleet</th><th>PIT</th><th>Keterangan</th><th>Oleh</th></tr></thead>
              <tbody>
                {moves.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap text-xs text-gray-500">{formatDateTime(m.createdAt)}</td>
                    <td className="font-mono font-semibold">{m.unit.code}</td>
                    <td className="text-sm">{m.fromFleet ?? "-"} → {m.toFleet ?? "-"}</td>
                    <td className="text-sm">{m.fromPit ?? "-"} → {m.toPit ?? "-"}</td>
                    <td className="text-xs text-gray-500">{m.note ?? ""}</td>
                    <td className="text-xs">{m.movedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function UnitForm({ pits, fleets, unit }: { pits: Pit[]; fleets: Fleet[]; unit?: Unit }) {
  const allModels = Object.values(UNIT_MODELS).flat();
  return (
    <ActionForm action={saveUnit} className="space-y-4" resetOnSuccess={!unit}>
      {unit && <input type="hidden" name="id" value={unit.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nomor Unit"><input name="code" defaultValue={unit?.code} className="input uppercase" placeholder="DT-042" required /></Field>
        <Field label="Jenis Unit">
          <select name="category" defaultValue={unit?.category ?? ""} className="input" required>
            <option value="" disabled>Pilih…</option>
            {UNIT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Model">
          <input name="model" list="unit-models" defaultValue={unit?.model} className="input" placeholder="Komatsu PC2000" required />
          <datalist id="unit-models">{allModels.map((m) => <option key={m} value={m} />)}</datalist>
        </Field>
        <Field label="Status Operasional">
          <select name="status" defaultValue={unit?.status ?? "STANDBY"} className="input">
            {UNIT_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Fleet">
          <select name="fleetId" defaultValue={unit?.fleetId ?? ""} className="input">
            <option value="">— Tanpa fleet —</option>
            {fleets.map((f) => <option key={f.id} value={f.id}>{f.code} — {f.name}</option>)}
          </select>
        </Field>
        <Field label="Lokasi / PIT" hint="Jika masuk fleet, lokasi mengikuti PIT fleet.">
          <select name="pitId" defaultValue={unit?.pitId ?? ""} className="input">
            <option value="">— Belum ditentukan —</option>
            {pits.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Keterangan"><textarea name="notes" defaultValue={unit?.notes ?? ""} rows={2} className="input" /></Field>
      {unit && <Field label="Catatan perpindahan (jika fleet/PIT berubah)"><input name="moveNote" className="input" /></Field>}
      <div className="flex justify-end"><SubmitButton>{unit ? "Simpan Perubahan" : "Tambah Unit"}</SubmitButton></div>
    </ActionForm>
  );
}
