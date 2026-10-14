import { desc } from "drizzle-orm";
import { UserPlus, KeyRound, Power, ShieldCheck, Search } from "lucide-react";
import { db } from "@/db";
import { accountDeactivations } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { PageHeader, Card, Badge, Field, Pagination, Tabs } from "@/components/ui";
import { Dialog } from "@/components/client/dialog";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { FilterForm } from "@/components/client/auto-submit";
import { DEACTIVATION_REASONS, ROLE_LABELS, deactivationLabel, glTypeLabel } from "@/lib/constants";
import { formatDate, formatDateTime, todayStr } from "@/lib/dates";
import { cancelDeactivation, changeRole, createAccount, resetPassword, setAccountActive } from "./actions";

export const metadata = { title: "User Management" };
const PAGE_SIZE = 25;

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const today = todayStr();
  const tab = sp.tab ?? "akun";
  let list = await db.query.users.findMany({ with: { personnel: true }, orderBy: (u, { asc }) => asc(u.employeeNo) });
  const deacts = await db.query.accountDeactivations.findMany({ orderBy: desc(accountDeactivations.startDate) });
  const noAccount = await db.query.personnel.findMany({ where: (p, { ne }) => ne(p.workStatus, "RESIGN"), with: { user: true }, orderBy: (p, { asc }) => asc(p.name) }).then((r) => r.filter((p) => !p.user));

  const statusOf = (u: (typeof list)[number]) => {
    if (u.isArchived) return { label: "Diarsipkan", tone: "gray" as const };
    if (!u.isActive) return { label: "Nonaktif", tone: "red" as const };
    const d = deacts.find((x) => x.userId === u.id && !x.cancelled && x.startDate <= today && (!x.endDate || x.endDate >= today));
    if (d) return { label: `Diblokir: ${deactivationLabel(d.reason)}`, tone: "orange" as const };
    if (u.lockedUntil && u.lockedUntil > new Date()) return { label: "Terkunci (login gagal)", tone: "red" as const };
    return { label: "Aktif", tone: "green" as const };
  };

  const q = (sp.q ?? "").toLowerCase();
  if (q) list = list.filter((u) => `${u.employeeNo} ${u.personnel?.name ?? u.displayName}`.toLowerCase().includes(q));
  if (sp.role) list = list.filter((u) => u.role === sp.role);
  if (sp.status) list = list.filter((u) => statusOf(u).label.startsWith(sp.status!));
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const rows = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const upcomingDeacts = deacts.filter((d) => !d.cancelled && (!d.endDate || d.endDate >= today));
  const userById = new Map(list.map((u) => [u.id, u]));
  const allUsers = await db.query.users.findMany({ with: { personnel: true } });
  const nameOf = (id: string) => {
    const u = userById.get(id) ?? allUsers.find((x) => x.id === id);
    return u ? `${u.personnel?.name ?? u.displayName} (${u.employeeNo})` : id;
  };

  return (
    <>
      <PageHeader
        title="User Management"
        description="Seluruh akun dibuat dan dikelola administrator. Satu nomor pegawai hanya terhubung dengan satu akun aktif."
        actions={
          <Dialog title="Tambah User" trigger={<><UserPlus className="h-4 w-4" /> Tambah User</>} size="md">
            <div className="space-y-6">
              <ActionForm action={createAccount} className="space-y-3">
                <input type="hidden" name="mode" value="personnel" />
                <p className="text-sm font-semibold">Akun Operator / Group Leader</p>
                <Field label="Personel tanpa akun" hint="Akun dihubungkan dengan data personel; password awal = tanggal lahir (DDMMYYYY).">
                  <select name="personnelId" className="input" required defaultValue="">
                    <option value="" disabled>{noAccount.length ? "Pilih personel…" : "Semua personel sudah memiliki akun"}</option>
                    {noAccount.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.employeeNo} ({p.category === "OPERATOR" ? "Operator" : glTypeLabel(p.glType)})</option>)}
                  </select>
                </Field>
                <SubmitButton className="btn-navy w-full">Buat Akun Personel</SubmitButton>
              </ActionForm>
              {me.role === "SUPER_ADMIN" && (
                <ActionForm action={createAccount} className="space-y-3 border-t border-gray-100 pt-5">
                  <input type="hidden" name="mode" value="admin" />
                  <p className="text-sm font-semibold">Akun Administrator</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Nomor Pegawai"><input name="employeeNo" className="input uppercase" required /></Field>
                    <Field label="Role">
                      <select name="role" className="input"><option value="ADMIN_MANPOWER">Admin Manpower</option><option value="SUPER_ADMIN">Super Admin</option></select>
                    </Field>
                  </div>
                  <Field label="Nama"><input name="displayName" className="input" required /></Field>
                  <Field label="Password sementara" hint="Min. 8 karakter, huruf & angka."><input name="password" type="text" className="input" required /></Field>
                  <SubmitButton className="btn-primary w-full">Buat Akun Admin</SubmitButton>
                </ActionForm>
              )}
            </div>
          </Dialog>
        }
      />
      <Tabs active={tab} items={[{ key: "akun", label: `Akun (${list.length})`, href: "/admin/users" }, { key: "jadwal", label: `Penonaktifan Terjadwal (${upcomingDeacts.length})`, href: "/admin/users?tab=jadwal" }]} />

      {tab === "jadwal" ? (
        <Card>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Akun</th><th>Alasan</th><th>Mulai</th><th>Selesai</th><th>Keterangan</th><th>Dibuat oleh</th><th /></tr></thead>
              <tbody>
                {upcomingDeacts.map((d) => (
                  <tr key={d.id}>
                    <td className="font-medium">{nameOf(d.userId)}</td>
                    <td><Badge tone={d.reason === "RESIGN" ? "gray" : d.reason === "SAKIT" ? "red" : "orange"}>{deactivationLabel(d.reason)}</Badge></td>
                    <td>{formatDate(d.startDate, { short: true })}</td>
                    <td>{d.endDate ? formatDate(d.endDate, { short: true }) : "Permanen"}</td>
                    <td className="text-xs text-gray-500">{d.note?.startsWith("leave:") ? "Otomatis dari cuti periodik" : d.note ?? ""}</td>
                    <td className="text-xs">{d.createdBy}</td>
                    <td>
                      {d.reason !== "RESIGN" && (
                        <ActionForm action={cancelDeactivation} confirm="Batalkan penonaktifan ini?" showMessage={false}>
                          <input type="hidden" name="id" value={d.id} />
                          <SubmitButton className="btn-ghost btn-sm text-brand" pendingText="…">Batalkan</SubmitButton>
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card>
          <FilterForm className="flex flex-col gap-3 border-b border-gray-100 p-4 md:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input name="q" data-noauto defaultValue={sp.q} placeholder="Cari nomor pegawai / nama…" className="input pl-9" />
            </div>
            <select name="role" defaultValue={sp.role ?? ""} className="input md:w-48">
              <option value="">Semua role</option>
              {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select name="status" defaultValue={sp.status ?? ""} className="input md:w-44">
              <option value="">Semua status</option>
              {["Aktif", "Diblokir", "Nonaktif", "Terkunci", "Diarsipkan"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn-navy">Cari</button>
          </FilterForm>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>No. Pegawai</th><th>Nama</th><th>Role</th><th>Status</th><th>Login Terakhir</th><th>Password</th><th className="text-right">Aksi</th></tr></thead>
              <tbody>
                {rows.map((u) => {
                  const st = statusOf(u);
                  const isAdminAcc = u.role === "SUPER_ADMIN" || u.role === "ADMIN_MANPOWER";
                  const canManage = !isAdminAcc || me.role === "SUPER_ADMIN";
                  const name = u.personnel?.name ?? u.displayName ?? "-";
                  return (
                    <tr key={u.id}>
                      <td className="font-mono text-xs">{u.employeeNo}</td>
                      <td className="font-semibold">{name}{u.id === me.id && <span className="ml-1 text-xs font-normal text-gray-400">(Anda)</span>}</td>
                      <td><Badge tone={isAdminAcc ? "navy" : "gray"}>{u.role === "GROUP_LEADER" && u.personnel ? glTypeLabel(u.personnel.glType) : ROLE_LABELS[u.role]}</Badge></td>
                      <td><Badge tone={st.tone}>{st.label}</Badge></td>
                      <td className="whitespace-nowrap text-xs text-gray-500">{formatDateTime(u.lastLoginAt)}</td>
                      <td>{u.mustChangePassword ? <Badge tone="orange">Wajib ganti</Badge> : <Badge tone="green">Sudah diganti</Badge>}</td>
                      <td>
                        {canManage && u.id !== me.id && (
                          <div className="flex justify-end gap-1">
                            <Dialog title={`Reset Password — ${name}`} trigger={<KeyRound className="h-4 w-4" />} triggerClassName="btn-ghost btn-sm px-2" size="sm">
                              <ActionForm action={resetPassword} className="space-y-3" confirm="Reset password akun ini? Sesi login aktif akan dicabut.">
                                <input type="hidden" name="id" value={u.id} />
                                {u.personnel ? (
                                  <p className="text-sm text-gray-600">Password akan dikembalikan ke tanggal lahir (DDMMYYYY) dan wajib diganti saat login berikutnya. Kunci login juga dibuka.</p>
                                ) : (
                                  <Field label="Password sementara"><input name="password" className="input" required /></Field>
                                )}
                                <Field label="Alasan"><input name="reason" className="input" placeholder="Opsional" /></Field>
                                <SubmitButton className="btn-primary w-full">Reset Password</SubmitButton>
                              </ActionForm>
                            </Dialog>
                            {!u.isArchived && (
                              <Dialog title={`Aktivasi Akun — ${name}`} trigger={<Power className="h-4 w-4" />} triggerClassName="btn-ghost btn-sm px-2" size="md">
                                <div className="space-y-5">
                                  {st.label !== "Aktif" && (
                                    <ActionForm action={setAccountActive}>
                                      <input type="hidden" name="id" value={u.id} />
                                      <input type="hidden" name="activate" value="1" />
                                      <p className="mb-3 text-sm text-gray-600">Status saat ini: <b>{st.label}</b>. Mengaktifkan akan membatalkan penonaktifan yang sedang berlaku dan membuka kunci login.</p>
                                      <SubmitButton className="btn-primary w-full">Aktifkan Akun</SubmitButton>
                                    </ActionForm>
                                  )}
                                  <ActionForm action={setAccountActive} className="space-y-3 border-t border-gray-100 pt-4" confirm="Nonaktifkan akun ini? Sesi aktif akan dicabut pada tanggal mulai.">
                                    <input type="hidden" name="id" value={u.id} />
                                    <input type="hidden" name="activate" value="0" />
                                    <p className="text-sm font-semibold">Nonaktifkan / jadwalkan penonaktifan</p>
                                    <Field label="Alasan">
                                      <select name="reason" className="input" required defaultValue="">
                                        <option value="" disabled>Pilih alasan…</option>
                                        {DEACTIVATION_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                                      </select>
                                    </Field>
                                    <div className="grid grid-cols-2 gap-3">
                                      <Field label="Mulai"><input type="date" name="start" defaultValue={today} className="input" /></Field>
                                      <Field label="Selesai" hint="Kosong = sampai diaktifkan"><input type="date" name="end" className="input" /></Field>
                                    </div>
                                    <Field label="Keterangan"><input name="note" className="input" /></Field>
                                    <SubmitButton className="btn-danger w-full">Simpan Penonaktifan</SubmitButton>
                                  </ActionForm>
                                </div>
                              </Dialog>
                            )}
                            {isAdminAcc && me.role === "SUPER_ADMIN" && (
                              <Dialog title={`Ubah Role — ${name}`} trigger={<ShieldCheck className="h-4 w-4" />} triggerClassName="btn-ghost btn-sm px-2" size="sm">
                                <ActionForm action={changeRole} className="space-y-3">
                                  <input type="hidden" name="id" value={u.id} />
                                  <Field label="Role">
                                    <select name="role" defaultValue={u.role} className="input"><option value="ADMIN_MANPOWER">Admin Manpower</option><option value="SUPER_ADMIN">Super Admin</option></select>
                                  </Field>
                                  <SubmitButton className="btn-navy w-full">Simpan</SubmitButton>
                                </ActionForm>
                              </Dialog>
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
          <Pagination page={page} pages={pages} makeHref={(p) => `/admin/users?${new URLSearchParams({ ...sp, page: String(p) })}`} />
        </Card>
      )}
    </>
  );
}
