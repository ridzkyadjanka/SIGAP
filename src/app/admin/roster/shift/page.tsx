import { Sun, Moon, Trash2, CalendarClock } from "lucide-react";
import { desc, gte } from "drizzle-orm";
import { db } from "@/db";
import { shiftOverrides } from "@/db/schema";
import { PageHeader, Card, CardHeader, Tabs, Badge, EmptyState, Field } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { getShiftConfigs, durations } from "@/lib/shifts";
import { addDays, formatDate, todayStr } from "@/lib/dates";
import { SHIFT_SHORT } from "@/lib/constants";
import { addShiftOverride, deleteShiftOverride, saveShiftConfig } from "../actions";

export const metadata = { title: "Template Shift" };

export default async function ShiftTemplatePage() {
  const today = todayStr();
  const configs = await getShiftConfigs();
  const pitList = await db.query.pits.findMany({ orderBy: (p, { asc }) => asc(p.code) });
  const overrides = await db.select().from(shiftOverrides).where(gte(shiftOverrides.date, addDays(today, -30))).orderBy(desc(shiftOverrides.date));
  const pitName = (id: string | null) => (id ? pitList.find((p) => p.id === id)?.code ?? "-" : "Semua lokasi");

  return (
    <>
      <PageHeader title="Template Shift & Jam Kerja" description="Atur jam kerja standar secara permanen, atau jam kerja khusus pada tanggal tertentu tanpa mengubah jadwal normal." />
      <Tabs
        active="TEMPLATE"
        items={[
          { key: "OPERATOR", label: "Roster Operator", href: "/admin/roster?cat=OPERATOR" },
          { key: "GROUP_LEADER", label: "Roster Group Leader", href: "/admin/roster?cat=GROUP_LEADER" },
          { key: "TEMPLATE", label: "Template Shift", href: "/admin/roster/shift" },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {configs.map((c) => {
          const d = durations(c);
          return (
            <Card key={c.code}>
              <CardHeader
                title={<span className="flex items-center gap-2">{c.code === "PAGI" ? <Sun className="h-4 w-4 text-emerald-600" /> : <Moon className="h-4 w-4 text-blue-600" />} {c.name}</span>}
                description={`Total ${d.totalHours} jam · Efektif ${d.effectiveHours} jam${c.code === "MALAM" ? " · selesai hari berikutnya" : ""}`}
              />
              <ActionForm action={saveShiftConfig} className="p-5" confirm="Simpan perubahan jam kerja permanen? Seluruh personel akan menerima notifikasi.">
                <input type="hidden" name="code" value={c.code} />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Jam Mulai"><input type="time" name="startTime" defaultValue={c.startTime} className="input" required /></Field>
                  <Field label="Jam Selesai"><input type="time" name="endTime" defaultValue={c.endTime} className="input" required /></Field>
                  <Field label="Istirahat Mulai"><input type="time" name="breakStart" defaultValue={c.breakStart} className="input" required /></Field>
                  <Field label="Istirahat Selesai"><input type="time" name="breakEnd" defaultValue={c.breakEnd} className="input" required /></Field>
                </div>
                <div className="mt-4 flex justify-end"><SubmitButton className="btn-navy">Simpan Permanen</SubmitButton></div>
              </ActionForm>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Jam Kerja Khusus</span>} description="Contoh: acara perusahaan, operasional dimulai lebih lambat." />
          <ActionForm action={addShiftOverride} className="space-y-4 p-5" resetOnSuccess>
            <Field label="Tanggal"><input type="date" name="date" defaultValue={today} className="input" required /></Field>
            <fieldset>
              <legend className="label">Shift</legend>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" name="shift" value="PAGI" defaultChecked className="accent-brand" /> Pagi</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="shift" value="MALAM" className="accent-brand" /> Malam</label>
              </div>
            </fieldset>
            <Field label="Berlaku untuk">
              <select name="pitId" className="input">
                <option value="">Semua lokasi</option>
                {pitList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mulai"><input type="time" name="startTime" defaultValue="09:00" className="input" required /></Field>
              <Field label="Selesai"><input type="time" name="endTime" defaultValue="18:00" className="input" required /></Field>
              <Field label="Istirahat mulai"><input type="time" name="breakStart" defaultValue="12:00" className="input" required /></Field>
              <Field label="Istirahat selesai"><input type="time" name="breakEnd" defaultValue="13:00" className="input" required /></Field>
            </div>
            <Field label="Alasan"><input name="reason" className="input" placeholder="Mis. Acara HUT perusahaan" required /></Field>
            <SubmitButton className="btn-primary w-full">Terapkan Jam Khusus</SubmitButton>
          </ActionForm>
        </Card>
        <Card>
          <CardHeader title="Daftar Jam Kerja Khusus" description="30 hari terakhir dan yang akan datang" />
          {overrides.length === 0 ? (
            <EmptyState title="Belum ada jam kerja khusus" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Tanggal</th><th>Shift</th><th>Lokasi</th><th>Jam</th><th>Istirahat</th><th>Alasan</th><th /></tr></thead>
                <tbody>
                  {overrides.map((o) => (
                    <tr key={o.id} className={o.date < today ? "opacity-60" : ""}>
                      <td className="whitespace-nowrap font-medium">{formatDate(o.date, { short: true })}</td>
                      <td><Badge tone={o.shift === "PAGI" ? "green" : "blue"}>{SHIFT_SHORT[o.shift]}</Badge></td>
                      <td>{pitName(o.pitId)}</td>
                      <td className="whitespace-nowrap">{o.startTime}–{o.endTime}</td>
                      <td className="whitespace-nowrap">{o.breakStart}–{o.breakEnd}</td>
                      <td className="text-xs text-gray-600">{o.reason}<div className="text-gray-400">oleh {o.createdBy}</div></td>
                      <td>
                        <ActionForm action={deleteShiftOverride} confirm="Hapus jam kerja khusus ini?" showMessage={false}>
                          <input type="hidden" name="id" value={o.id} />
                          <SubmitButton className="btn-ghost btn-sm px-2 text-brand" pendingText="…"><Trash2 className="h-4 w-4" /></SubmitButton>
                        </ActionForm>
                      </td>
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
