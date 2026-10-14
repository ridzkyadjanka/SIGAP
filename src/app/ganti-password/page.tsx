import Link from "next/link";
import { KeyRound } from "lucide-react";
import { requireUser, homeFor } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { PasswordInput } from "@/components/client/password-input";
import { Logo } from "@/components/logo";
import { changePasswordAction } from "./actions";
import { logoutAction } from "../login/actions";

export const metadata = { title: "Ganti Password" };

export default async function ChangePasswordPage() {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="card p-6 sm:p-8">
          <div className="mb-6 flex items-start gap-3">
            <div className="rounded-lg bg-brand-light p-2 text-brand">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-navy">Ganti Password</h1>
              <p className="text-sm text-gray-500">
                {user.mustChangePassword
                  ? `Halo ${user.name}, demi keamanan Anda wajib mengganti password awal sebelum melanjutkan.`
                  : "Perbarui password akun Anda."}
              </p>
            </div>
          </div>
          <ActionForm action={changePasswordAction} className="space-y-4">
            <label className="block">
              <span className="label">Password saat ini</span>
              <PasswordInput name="current" autoComplete="current-password" />
            </label>
            <label className="block">
              <span className="label">Password baru</span>
              <PasswordInput name="next" autoComplete="new-password" />
              <span className="mt-1 block text-xs text-gray-500">Minimal 8 karakter, kombinasi huruf dan angka, bukan tanggal lahir.</span>
            </label>
            <label className="block">
              <span className="label">Ulangi password baru</span>
              <PasswordInput name="confirm" autoComplete="new-password" />
            </label>
            <SubmitButton className="btn-primary w-full">Simpan Password</SubmitButton>
          </ActionForm>
          <div className="mt-6 flex justify-between text-sm">
            {!user.mustChangePassword ? (
              <Link href={homeFor(user.role)} className="font-medium text-gray-500 hover:text-navy">
                Kembali
              </Link>
            ) : (
              <span />
            )}
            <form action={logoutAction}>
              <button className="font-medium text-gray-500 hover:text-brand">Keluar</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
