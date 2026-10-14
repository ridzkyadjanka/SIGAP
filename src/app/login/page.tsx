import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { getCurrentUser, homeFor } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { Logo } from "@/components/logo";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { PasswordInput } from "@/components/client/password-input";
import { loginAction } from "./actions";

export const metadata = { title: "Masuk" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/ganti-password" : homeFor(user.role));
  const c = await getSetting("landing");
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={c.heroImage} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: c.heroPosition }} />
        <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/70 to-navy/30" />
        <div className="absolute bottom-0 p-12 text-white">
          <Logo light src={c.logo || undefined} />
          <h2 className="mt-6 max-w-md text-3xl font-extrabold leading-tight">Sistem Informasi Gerak dan Penugasan</h2>
          <p className="mt-3 max-w-md text-white/75">Pengelolaan manpower, roster, penugasan unit, dan cuti periodik dalam satu platform.</p>
        </div>
      </div>
      <div className="flex flex-col justify-center bg-white px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/" className="mb-10 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-navy">
            <ArrowLeft className="h-4 w-4" /> Kembali ke beranda
          </Link>
          <div className="lg:hidden">
            <Logo src={c.logo || undefined} />
          </div>
          <h1 className="mt-6 text-2xl font-extrabold text-navy lg:mt-0">Masuk ke SIGAP</h1>
          <p className="mt-1 text-sm text-gray-500">Gunakan nomor pegawai dan password Anda.</p>

          <ActionForm action={loginAction} className="mt-8 space-y-4">
            <label className="block">
              <span className="label">Nomor Pegawai</span>
              <input name="employeeNo" className="input uppercase" placeholder="Contoh: OP1001" autoComplete="username" required autoFocus />
            </label>
            <label className="block">
              <span className="label">Password</span>
              <PasswordInput name="password" placeholder="••••••••" />
            </label>
            <SubmitButton className="btn-primary w-full py-2.5" pendingText="Memeriksa…">
              Masuk
            </SubmitButton>
          </ActionForm>

          <div className="mt-8 flex gap-3 rounded-xl bg-surface p-4 text-xs leading-relaxed text-gray-600">
            <Info className="h-4 w-4 shrink-0 text-navy" />
            <p>
              Login pertama: password awal adalah tanggal lahir format <b>DDMMYYYY</b> dan wajib diganti. Lupa password atau akun
              nonaktif? Hubungi {c.contactName} ({c.contactPhone}). Tidak tersedia pendaftaran mandiri.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
