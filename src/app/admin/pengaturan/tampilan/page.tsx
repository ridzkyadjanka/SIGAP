import Link from "next/link";
import { desc } from "drizzle-orm";
import { Eye, Send, RotateCcw, ExternalLink } from "lucide-react";
import { db } from "@/db";
import { siteContentVersions } from "@/db/schema";
import { PageHeader, Card, CardHeader, Field, Tabs, Badge } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Logo } from "@/components/logo";
import { getLandingDraft, getSetting } from "@/lib/settings";
import { formatDateTime } from "@/lib/dates";
import { discardDraft, publishLanding, restoreLanding, saveLandingDraft } from "../actions";

export const metadata = { title: "Tampilan Website" };

const TABS = [
  { key: "kerja", label: "Shift & Pola Kerja", href: "/admin/pengaturan" },
  { key: "tampilan", label: "Tampilan Website", href: "/admin/pengaturan/tampilan" },
  { key: "audit", label: "Audit Log", href: "/admin/pengaturan/audit" },
];

export default async function AppearancePage() {
  const d = await getLandingDraft();
  const live = await getSetting("landing");
  const changed = JSON.stringify(d) !== JSON.stringify(live);
  const versions = await db.select().from(siteContentVersions).orderBy(desc(siteContentVersions.createdAt)).limit(10);

  return (
    <>
      <PageHeader
        title="Pengaturan"
        description="Kelola foto halaman depan, logo, judul, deskripsi, tombol, dan informasi footer — tanpa coding."
        actions={<Link href="/" target="_blank" className="btn-outline"><ExternalLink className="h-4 w-4" /> Lihat Website</Link>}
      />
      <Tabs active="tampilan" items={TABS} />

      {/* Preview */}
      <Card className="mb-6 overflow-hidden">
        <CardHeader
          title={<span className="flex items-center gap-2"><Eye className="h-4 w-4" /> Preview Draft {changed ? <Badge tone="orange">Belum dipublikasikan</Badge> : <Badge tone="green">Sama dengan yang tayang</Badge>}</span>}
          actions={
            <>
              {changed && (
                <ActionForm action={discardDraft} showMessage={false} confirm="Buang perubahan draft?">
                  <SubmitButton className="btn-ghost btn-sm" pendingText="…">Buang draft</SubmitButton>
                </ActionForm>
              )}
              <ActionForm action={publishLanding} confirm="Publikasikan tampilan ini ke halaman depan?">
                <SubmitButton className="btn-primary btn-sm" pendingText="Mempublikasikan…"><Send className="h-4 w-4" /> Publikasikan</SubmitButton>
              </ActionForm>
            </>
          }
        />
        <div className="relative isolate h-80 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={d.heroImage} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" style={{ objectPosition: d.heroPosition }} />
          <div className="absolute inset-0 -z-10 bg-navy" style={{ opacity: d.overlayOpacity / 100 }} />
          <div className="flex h-full flex-col justify-center p-8 text-white">
            <Logo light src={d.logo || undefined} />
            <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-white/70">{d.heroSubtitle}</p>
            <p className="mt-1 max-w-2xl text-2xl font-extrabold sm:text-3xl">{d.heroTitle}</p>
            <p className="mt-2 max-w-xl text-sm text-white/80">{d.heroDescription}</p>
            <span className="btn-primary mt-5 w-fit">{d.ctaText}</span>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <ActionForm action={saveLandingDraft} className="space-y-4">
          <Card>
            <CardHeader title="Hero Banner & Logo" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Foto hero banner" hint="JPG/PNG/WEBP, maks. 5 MB. Disarankan 1920×1080."><input type="file" name="heroFile" accept="image/jpeg,image/png,image/webp" className="input" /></Field>
              <Field label="Logo SIGAP" hint="Persegi, PNG transparan disarankan."><input type="file" name="logoFile" accept="image/jpeg,image/png,image/webp" className="input" /></Field>
              <Field label="Posisi gambar">
                <select name="heroPosition" defaultValue={d.heroPosition} className="input">
                  {[["center", "Tengah"], ["top", "Atas"], ["bottom", "Bawah"], ["left", "Kiri"], ["right", "Kanan"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <Field label={`Overlay gelap (0–90%)`}><input type="number" name="overlayOpacity" min={0} max={90} defaultValue={d.overlayOpacity} className="input" /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="defaultHero" className="accent-brand" /> Gunakan gambar bawaan</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="removeLogo" className="accent-brand" /> Hapus logo (pakai logo bawaan)</label>
            </div>
          </Card>
          <Card>
            <CardHeader title="Teks Halaman Depan" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Judul" className="sm:col-span-2"><input name="heroTitle" defaultValue={d.heroTitle} className="input" /></Field>
              <Field label="Subjudul (label kecil)"><input name="heroSubtitle" defaultValue={d.heroSubtitle} className="input" /></Field>
              <Field label="Teks tombol"><input name="ctaText" defaultValue={d.ctaText} className="input" /></Field>
              <Field label="Deskripsi" className="sm:col-span-2"><textarea name="heroDescription" rows={2} defaultValue={d.heroDescription} className="input" /></Field>
              <Field label="Judul bagian Tentang" className="sm:col-span-2"><input name="aboutTitle" defaultValue={d.aboutTitle} className="input" /></Field>
              <Field label="Teks Tentang SIGAP" className="sm:col-span-2"><textarea name="aboutText" rows={4} defaultValue={d.aboutText} className="input" /></Field>
              <Field label="Manfaat (satu per baris)" className="sm:col-span-2"><textarea name="benefits" rows={4} defaultValue={d.benefits.join("\n")} className="input" /></Field>
            </div>
          </Card>
          <Card>
            <CardHeader title="Kontak & Footer" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Nama kontak administrator"><input name="contactName" defaultValue={d.contactName} className="input" /></Field>
              <Field label="Email"><input name="contactEmail" defaultValue={d.contactEmail} className="input" /></Field>
              <Field label="Telepon"><input name="contactPhone" defaultValue={d.contactPhone} className="input" /></Field>
              <Field label="Versi aplikasi"><input name="version" defaultValue={d.version} className="input" /></Field>
              <Field label="Alamat" className="sm:col-span-2"><input name="contactAddress" defaultValue={d.contactAddress} className="input" /></Field>
              <Field label="Teks footer" className="sm:col-span-2"><input name="footerText" defaultValue={d.footerText} className="input" /></Field>
            </div>
          </Card>
          <div className="flex justify-end"><SubmitButton>Simpan Draft & Preview</SubmitButton></div>
        </ActionForm>

        <Card className="self-start">
          <CardHeader title={<span className="flex items-center gap-2"><RotateCcw className="h-4 w-4" /> Riwayat Publikasi</span>} description="Kembalikan tampilan sebelumnya" />
          <ul className="divide-y divide-gray-100">
            {versions.map((v, i) => (
              <li key={v.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <div className="flex-1">
                  <p className="font-medium">{formatDateTime(v.createdAt)}</p>
                  <p className="text-xs text-gray-500">{v.publishedBy}</p>
                </div>
                {i === 0 ? <Badge tone="green">Tayang</Badge> : (
                  <ActionForm action={restoreLanding} confirm="Kembalikan tampilan ke versi ini?" showMessage={false}>
                    <input type="hidden" name="id" value={v.id} />
                    <SubmitButton className="btn-outline btn-sm" pendingText="…">Pulihkan</SubmitButton>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
