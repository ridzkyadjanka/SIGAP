import Link from "next/link";
import { CalendarCog, Plane, BellRing, Lock, Clock } from "lucide-react";
import { PageHeader, Card, CardHeader, Field, Tabs } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { getSetting } from "@/lib/settings";
import { getShiftConfigs } from "@/lib/shifts";
import { saveWarningDays, saveWorkSettings } from "./actions";

export const metadata = { title: "Pengaturan" };

const SETTINGS_TABS = [
  { key: "kerja", label: "Shift & Pola Kerja", href: "/admin/pengaturan" },
  { key: "tampilan", label: "Tampilan Website", href: "/admin/pengaturan/tampilan" },
  { key: "audit", label: "Audit Log", href: "/admin/pengaturan/audit" },
];

export default async function SettingsPage() {
  const pattern = await getSetting("roster_pattern");
  const leave = await getSetting("leave_rules");
  const warn = await getSetting("warning_days");
  const login = await getSetting("login_policy");
  const shifts = await getShiftConfigs();
  return (
    <>
      <PageHeader title="Pengaturan" description="Parameter operasional dapat diubah sesuai kebijakan perusahaan tanpa coding." />
      <Tabs active="kerja" items={SETTINGS_TABS} />
      <ActionForm action={saveWorkSettings} className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><CalendarCog className="h-4 w-4" /> Pola Roster</span>} description="Berlaku untuk operator & seluruh jenis Group Leader." />
          <div className="grid grid-cols-3 gap-3 p-5">
            <Field label="Hari Shift Pagi"><input type="number" name="morning" min={0} max={30} defaultValue={pattern.morning} className="input" /></Field>
            <Field label="Hari Shift Malam"><input type="number" name="night" min={0} max={30} defaultValue={pattern.night} className="input" /></Field>
            <Field label="Hari Libur"><input type="number" name="off" min={0} max={30} defaultValue={pattern.off} className="input" /></Field>
          </div>
          <p className="px-5 pb-5 text-xs text-gray-500">
            Siklus saat ini {pattern.morning + pattern.night + pattern.off} hari. Hari libur jatuh setelah shift malam terakhir selesai pukul {shifts[1].endTime}; shift pagi siklus berikutnya dimulai pukul {shifts[0].startTime} keesokan harinya.
          </p>
        </Card>
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Plane className="h-4 w-4" /> Ketentuan Cuti Periodik</span>} description="Dihitung dari hari kerja aktual pada roster (hari P & M)." />
          <div className="grid grid-cols-3 gap-3 p-5">
            <Field label="Operator (hari kerja)"><input type="number" name="operatorWorkdays" min={1} defaultValue={leave.operatorWorkdays} className="input" /></Field>
            <Field label="Group Leader (hari kerja)"><input type="number" name="glWorkdays" min={1} defaultValue={leave.glWorkdays} className="input" /></Field>
            <Field label="Durasi cuti (hari)"><input type="number" name="durationDays" min={1} defaultValue={leave.durationDays} className="input" /></Field>
          </div>
        </Card>
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Lock className="h-4 w-4" /> Keamanan Login</span>} />
          <div className="grid grid-cols-2 gap-3 p-5">
            <Field label="Maks. percobaan gagal"><input type="number" name="maxAttempts" min={3} max={20} defaultValue={login.maxAttempts} className="input" /></Field>
            <Field label="Durasi kunci (menit)"><input type="number" name="lockMinutes" min={1} defaultValue={login.lockMinutes} className="input" /></Field>
          </div>
        </Card>
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Clock className="h-4 w-4" /> Jam Kerja</span>} />
          <div className="space-y-2 p-5 text-sm">
            {shifts.map((s) => (
              <p key={s.code}><b>{s.name}:</b> {s.startTime}–{s.endTime}, istirahat {s.breakStart}–{s.breakEnd}</p>
            ))}
            <Link href="/admin/roster/shift" className="inline-block pt-2 font-semibold text-brand hover:underline">Ubah jam kerja / jam khusus →</Link>
          </div>
        </Card>
        <div className="flex justify-end lg:col-span-2">
          <SubmitButton>Simpan Pengaturan</SubmitButton>
        </div>
      </ActionForm>

      <Card className="mt-6" >
        <div id="notifikasi" />
        <CardHeader title={<span className="flex items-center gap-2"><BellRing className="h-4 w-4" /> Interval Notifikasi Cuti (Early Warning)</span>} description="Default: H-30 persiapan, H-14 perencanaan pengganti, H-7 cek kesiapan, H-3 mendesak, H-1 konfirmasi." />
        <ActionForm action={saveWarningDays} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
          <Field label="Hari sebelum cuti (pisahkan dengan koma)" className="flex-1">
            <input name="days" defaultValue={warn.join(", ")} className="input" />
          </Field>
          <SubmitButton className="btn-navy">Simpan Interval</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
