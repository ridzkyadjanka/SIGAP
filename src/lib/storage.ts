import "server-only";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

// Penyimpanan file unggahan (foto hero banner & logo).
// - Jika SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY diisi → Supabase Storage (wajib untuk Netlify/Vercel).
// - Jika tidak → folder lokal storage/uploads (untuk server sendiri / laptop).

export const usingSupabaseStorage = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function saveFile(name: string, buf: Buffer, contentType: string): Promise<string> {
  if (usingSupabaseStorage()) {
    const base = process.env.SUPABASE_URL!.replace(/\/+$/, "");
    const bucket = process.env.SUPABASE_BUCKET || "sigap-uploads";
    const res = await fetch(`${base}/storage/v1/object/${bucket}/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        "Content-Type": contentType,
        "Cache-Control": "31536000",
        "x-upsert": "false",
      },
      body: new Uint8Array(buf),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(`Upload ke Supabase Storage gagal (${res.status}): ${msg.slice(0, 200)}`);
    }
    return `${base}/storage/v1/object/public/${bucket}/${name}`;
  }
  const dir = path.join(process.cwd(), "storage", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), buf);
  return `/api/uploads/${name}`;
}
