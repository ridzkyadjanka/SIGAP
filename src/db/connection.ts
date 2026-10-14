// Konfigurasi koneksi PostgreSQL yang dipakai aplikasi, drizzle-kit, dan skrip database.
// - Lokal (localhost): tanpa SSL.
// - Cloud (Supabase, Neon, Railway, dll.): SSL aktif. Sertifikat Supabase memakai CA sendiri,
//   sehingga verifikasi rantai sertifikat dilonggarkan (koneksi tetap terenkripsi).
import type { PoolConfig } from "pg";

export function pgConfig(rawUrl = process.env.DATABASE_URL): PoolConfig {
  if (!rawUrl) throw new Error("DATABASE_URL belum diisi di file .env / environment variables.");
  const url = new URL(rawUrl);
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const sslDisabled = url.searchParams.get("sslmode") === "disable";
  url.searchParams.delete("sslmode"); // ditangani lewat opsi ssl di bawah
  return {
    connectionString: url.toString(),
    ssl: local || sslDisabled ? false : { rejectUnauthorized: false },
  };
}

/** Lingkungan serverless (Netlify/Vercel): batasi koneksi per instance. */
export const isServerless = !!(process.env.NETLIFY || process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
