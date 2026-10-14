import Link from "next/link";
import { Plus, Pencil, Search, UserCog, CalendarDays } from "lucide-react";
import { db } from "@/db";
import { PageHeader, Card, Badge, EmptyState, Pagination, Field } from "@/components/ui";
import { Dialog } from "@/components/client/dialog";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { FilterForm } from "@/components/client/auto-submit";
import { GL_TYPES, UNIT_CATEGORIES, WORK_STATUS, glTypeLabel, unitCategoryLabel, ROSTER_CODES } from "@/lib/constants";
import { formatDate, todayStr } from "@/lib/dates";
import { loadRosterContext, rosterCode } from "@/lib/roster";
import { activeDeactivation } from "@/lib/auth";
import { savePersonnel, setWorkStatus, toggleAccount } from "./actions";
import type { Personnel, Pit } from "@/db/schema";

const PAGE_SIZE = 20;

type SP = { q?: string; status?: string; skill?: string; gl?: string; pit?: string; page?: string };

export async function ManpowerView({ category, sp }: { category: "OPERATOR" | "GROUP_LEADER"; sp: SP }) {
  const isOp = category === "OPERATOR";
  const today = todayStr();
  const pitList = await db.query.pits.findMany({ orderBy: (p, { asc }) => asc(p.code) });
  let rows = await db.query.personnel.findMany({
    where: (p, { eq }) => eq(p.category, category),
    with: { user: true, pit: true },
    orderBy: (p, { asc }) => asc(p.name),
  });

  const q = (sp.q ?? "").toLowerCase();
  if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.employeeNo.toLowerCase().includes(q));
  if (sp.status) rows = rows.filter((r) => r.workStatus === sp.status);
  if (sp.skill) rows = rows.filter((r) => r.skills.includes(sp.skill!));
  if (sp.gl) rows = rows.filter((r) => r.glType === sp.gl);
  if (sp.pit) rows = rows.filter((r) => r.pitId === sp.pit);

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const ctx = await loadRosterContext(pageRows.map((r) => r.id));
  const blocked = new Map<string, string>();
  for (const r of pageRows) {
    if (r.user) {
      const d = await activeDeactivation(r.user.id);
      if (d) blocked.set(r.id, d.reason);
    }
  }

  const base = isOp ? "/admin/manpower/operator" : "/admin/manpower/group-leader";
  const makeHref = (p: number) => {
    const params = new URLSearchParams(Object.entries({ ...sp, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `${base}?${params}`;
  };

  return (
    <>
      <PageHeader
        title={isOp ? "Operator Management" : "Group Leader Management"}
        description={
          isOp
            ? "Kelola data operator, skill unit, status kerja, dan akun login."
            : "Kelola GL Produksi, Dewatering, Manpower, OPD, dan Hauling beserta penempatannya."
        }
        actions={
          <Dialog
            title={isOp ? "Tambah Operator" : "Tambah Group Leader"}
            description="Akun login dibuat otomatis dengan password awal tanggal lahir (DDMMYYYY)."
            trigger={<><Plus className="h-4 w-4" /> Tambah {isOp ? "Operator" : "Group Leader"}</>}
            size="lg"
          >
            <PersonnelForm category={category} pits={pitList} />
          </Dialog>
        }
      />

      <Card>
        <FilterForm className="flex flex-col gap-3 border-b border-gray-100 p-4 md:flex-row md:items-end">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input name="q" defaultValue={sp.q} data-noauto placeholder="Cari nama atau nomor pegawai…" className="input pl-9" />
          </div>
          <select name="status" defaultValue={sp.status ?? ""} className="input md:w-40">
            <option value="">Semua status</option>
            {WORK_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          {isOp ? (
            <select name="skill" defaultValue={sp.skill ?? ""} className="input md:w-48">
              <option value="">Semua skill</option>
              {UNIT_CATEGORIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          ) : (
            <select name="gl" defaultValue={sp.gl ?? ""} className="input md:w-48">
              <option value="">Semua jenis GL</option>
              {GL_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          )}
          <select name="pit" defaultValue={sp.pit ?? ""} className="input md:w-48">
            <option value="">Semua lokasi</option>
            {pitList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn-navy">Cari</button>
        </FilterForm>

        <div className="flex items-center justify-between px-5 py-3 text-xs text-gray-500">
          <span>{total} data ditemukan</span>
        </div>

        {pageRows.length === 0 ? (
          <EmptyState title="Belum ada data" description="Ubah filter pencarian atau tambahkan data baru." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>No. Pegawai</th>
                  <th>Nama</th>
                  <th>{isOp ? "Skill Unit" : "Jenis GL"}</th>
                  <th>Lokasi</th>
                  <th>Telepon</th>
                  <th>Roster Hari Ini</th>
                  <th>Status Kerja</th>
                  <th>Akun</th>
                  <th>Mulai Siklus</th>
                  <th className="text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const ws = WORK_STATUS.find((s) => s.value === r.workStatus)!;
                  const code = rosterCode(r, ctx, today);
                  const rc = ROSTER_CODES[code];
                  return (
                    <tr key={r.id}>
                      <td className="font-mono text-xs">{r.employeeNo}</td>
                      <td>
                        <p className="font-semibold">{r.name}</p>
                        <p className="text-xs text-gray-500">Bergabung {formatDate(r.joinDate, { short: true })}</p>
                      </td>
                      <td>
                        {isOp ? (
                          <div className="flex flex-wrap gap-1">
                            {r.skills.map((s) => <Badge key={s} tone="navy">{unitCategoryLabel(s).replace(" (Sany SRT100S)", "")}</Badge>)}
                          </div>
                        ) : (
                          <Badge tone="navy">{glTypeLabel(r.glType)}</Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-gray-600">{r.pit?.code ?? "-"}</td>
                      <td className="whitespace-nowrap text-gray-600">{r.phone ?? "-"}</td>
                      <td><span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${rc.className}`}>{rc.label}</span></td>
                      <td><Badge tone={ws.tone}>{ws.label}</Badge></td>
                      <td>
                        {!r.user ? (
                          <Badge tone="gray">Belum ada</Badge>
                        ) : r.user.isArchived ? (
                          <Badge tone="gray">Diarsipkan</Badge>
                        ) : !r.user.isActive ? (
                          <Badge tone="red">Nonaktif</Badge>
                        ) : blocked.has(r.id) ? (
                          <Badge tone="orange">Diblokir</Badge>
                        ) : (
                          <Badge tone="green">Aktif</Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-gray-600">{formatDate(r.cycleStartDate, { short: true })}</td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <Link href={`/admin/roster?person=${r.id}&cat=${category}`} className="btn-ghost btn-sm px-2" title="Lihat roster">
                            <CalendarDays className="h-4 w-4" />
                          </Link>
                          <Dialog title={`Edit ${r.name}`} trigger={<Pencil className="h-4 w-4" />} triggerClassName="btn-ghost btn-sm px-2" size="lg">
                            <PersonnelForm category={category} pits={pitList} person={r} />
                          </Dialog>
                          <Dialog title={`Status & Akun — ${r.name}`} trigger={<UserCog className="h-4 w-4" />} triggerClassName="btn-ghost btn-sm px-2" size="sm">
                            <StatusPanel person={r} accountActive={r.user?.isActive ?? null} archived={r.user?.isArchived ?? false} />
                          </Dialog>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pages} makeHref={makeHref} />
      </Card>
    </>
  );
}

function PersonnelForm({
  category,
  pits,
  person,
}: {
  category: "OPERATOR" | "GROUP_LEADER";
  pits: Pit[];
  person?: Personnel;
}) {
  const today = todayStr();
  return (
    <ActionForm action={savePersonnel} className="space-y-4" resetOnSuccess={!person}>
      {person && <input type="hidden" name="id" value={person.id} />}
      <input type="hidden" name="category" value={category} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nomor Pegawai (NIK Internal)">
          <input name="employeeNo" defaultValue={person?.employeeNo} className="input uppercase" required />
        </Field>
        <Field label="Nama Lengkap">
          <input name="name" defaultValue={person?.name} className="input" required />
        </Field>
        <Field label="Tanggal Lahir" hint={person ? undefined : "Dipakai sebagai password awal (DDMMYYYY)"}>
          <input type="date" name="birthDate" defaultValue={person?.birthDate} className="input" required />
        </Field>
        <Field label="Nomor Telepon">
          <input name="phone" defaultValue={person?.phone ?? ""} className="input" inputMode="tel" />
        </Field>
        {category === "GROUP_LEADER" && (
          <Field label="Jenis Group Leader / Departemen">
            <select name="glType" defaultValue={person?.glType ?? ""} className="input" required>
              <option value="" disabled>Pilih…</option>
              {GL_TYPES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </Field>
        )}
        <Field label={category === "GROUP_LEADER" ? "Penempatan Kerja (PIT)" : "Lokasi / PIT utama"}>
          <select name="pitId" defaultValue={person?.pitId ?? ""} className="input">
            <option value="">— Belum ditentukan —</option>
            {pits.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Status Kerja">
          <select name="workStatus" defaultValue={person?.workStatus ?? "AKTIF"} className="input">
            {WORK_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Tanggal Bergabung">
          <input type="date" name="joinDate" defaultValue={person?.joinDate ?? today} className="input" required />
        </Field>
        <Field label="Tanggal Mulai Siklus" hint="Hari ke-1 roster (Shift Pagi). Dasar perhitungan roster & cuti.">
          <input type="date" name="cycleStartDate" defaultValue={person?.cycleStartDate ?? today} className="input" required />
        </Field>
      </div>
      {category === "OPERATOR" && (
        <fieldset>
          <legend className="label">Skill Unit (boleh lebih dari satu)</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {UNIT_CATEGORIES.map((c) => (
              <label key={c.value} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
                <input type="checkbox" name="skills" value={c.value} defaultChecked={person?.skills.includes(c.value)} className="accent-brand" />
                {c.label.replace(" (Sany SRT100S)", "")}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {!person && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="createAccount" defaultChecked className="accent-brand" /> Buat akun login otomatis
        </label>
      )}
      <div className="flex justify-end">
        <SubmitButton>{person ? "Simpan Perubahan" : "Tambah"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

function StatusPanel({ person, accountActive, archived }: { person: Personnel; accountActive: boolean | null; archived: boolean }) {
  return (
    <div className="space-y-6">
      <ActionForm action={setWorkStatus} className="space-y-3">
        <input type="hidden" name="id" value={person.id} />
        <Field label="Status Kerja">
          <select name="status" defaultValue={person.workStatus} className="input">
            {WORK_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Alasan / Keterangan">
          <input name="reason" className="input" placeholder="Opsional" />
        </Field>
        <p className="text-xs text-gray-500">Status Resign akan mengarsipkan akun secara permanen (histori tetap tersimpan).</p>
        <SubmitButton className="btn-navy w-full">Simpan Status Kerja</SubmitButton>
      </ActionForm>
      <div className="border-t border-gray-100 pt-5">
        <p className="label">Status Akun</p>
        <p className="mb-3 text-sm text-gray-600">
          {accountActive === null
            ? "Personel ini belum memiliki akun login."
            : archived
              ? "Akun diarsipkan (resign)."
              : accountActive
                ? "Akun aktif. Menonaktifkan akun akan menolak login dan mencabut sesi aktif."
                : "Akun nonaktif."}
        </p>
        {!archived && (
          <ActionForm action={toggleAccount} confirm={accountActive ? "Nonaktifkan akun ini? Sesi login aktif akan dicabut." : undefined}>
            <input type="hidden" name="personnelId" value={person.id} />
            {accountActive && <input name="reason" className="input mb-3" placeholder="Alasan penonaktifan" />}
            <SubmitButton className={accountActive ? "btn-danger w-full" : "btn-primary w-full"}>
              {accountActive === null ? "Buat Akun Login" : accountActive ? "Nonaktifkan Akun" : "Aktifkan Akun"}
            </SubmitButton>
          </ActionForm>
        )}
        <p className="mt-3 text-xs text-gray-500">
          Penonaktifan terjadwal (sakit, cuti) dan reset password tersedia di menu <Link href="/admin/users" className="font-semibold text-brand">User Management</Link>.
        </p>
      </div>
    </div>
  );
}
