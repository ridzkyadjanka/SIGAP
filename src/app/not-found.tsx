import Link from "next/link";
import { LogoMark } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-4 text-center">
      <LogoMark className="h-12 w-12" />
      <h1 className="text-2xl font-extrabold">Halaman tidak ditemukan</h1>
      <p className="text-sm text-gray-500">Alamat yang Anda buka tidak tersedia atau Anda tidak memiliki akses.</p>
      <Link href="/" className="btn-primary">Kembali ke beranda</Link>
    </div>
  );
}
