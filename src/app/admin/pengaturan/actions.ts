"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/db";
import { siteContentVersions } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { fail, ok, str, type ActionResult } from "@/lib/action";
import { DEFAULTS, getLandingDraft, getSetting, setSetting, type LandingContent } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { runMaintenance } from "@/lib/operations";
import { saveFile } from "@/lib/storage";

const int = (fd: FormData, k: string) => Math.round(Number(str(fd, k)));

export async function saveWorkSettings(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const pattern = { morning: int(fd, "morning"), night: int(fd, "night"), off: int(fd, "off") };
  const leave = { operatorWorkdays: int(fd, "operatorWorkdays"), glWorkdays: int(fd, "glWorkdays"), durationDays: int(fd, "durationDays") };
  const login = { maxAttempts: int(fd, "maxAttempts"), lockMinutes: int(fd, "lockMinutes") };
  if (Object.values(pattern).some((v) => !Number.isFinite(v) || v < 0 || v > 30) || pattern.morning + pattern.night + pattern.off < 1) return fail("Pola roster tidak valid (0–30 hari per bagian).");
  if (Object.values(leave).some((v) => !Number.isFinite(v) || v < 1 || v > 365)) return fail("Parameter cuti tidak valid.");
  if (login.maxAttempts < 3 || login.maxAttempts > 20 || login.lockMinutes < 1 || login.lockMinutes > 1440) return fail("Kebijakan login tidak valid.");
  const before = { pattern: await getSetting("roster_pattern"), leave: await getSetting("leave_rules") };
  await setSetting("roster_pattern", pattern);
  await setSetting("leave_rules", leave);
  await setSetting("login_policy", login);
  await logAudit(admin, "UPDATE", "Pengaturan", {
    detail: `Pola ${before.pattern.morning}-${before.pattern.night}-${before.pattern.off} → ${pattern.morning}-${pattern.night}-${pattern.off}; cuti OP ${leave.operatorWorkdays}, GL ${leave.glWorkdays}, durasi ${leave.durationDays}`,
  });
  await runMaintenance(true);
  revalidatePath("/admin", "layout");
  return ok("Pengaturan pola kerja & cuti disimpan.");
}

export async function saveWarningDays(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const days = [...new Set(str(fd, "days").split(/[,\s]+/).filter(Boolean).map(Number))].filter((n) => Number.isInteger(n) && n >= 0 && n <= 90).sort((a, b) => b - a);
  if (!days.length) return fail("Masukkan minimal satu interval (0–90 hari), dipisah koma.");
  await setSetting("warning_days", days);
  await logAudit(admin, "UPDATE", "Pengaturan", { detail: `Interval notifikasi cuti: H-${days.join(", H-")}` });
  await runMaintenance(true);
  revalidatePath("/admin", "layout");
  return ok(`Interval notifikasi: H-${days.join(", H-")}.`);
}

// ───────────── Tampilan website ─────────────

const ALLOWED = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
const MAX_BYTES = 5 * 1024 * 1024;

async function storeUpload(file: File): Promise<string | ActionResult> {
  const ext = ALLOWED[file.type as keyof typeof ALLOWED];
  if (!ext) return fail("Format gambar harus JPG, PNG, atau WEBP.");
  if (file.size > MAX_BYTES) return fail("Ukuran gambar maksimal 5 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  // Validasi isi file (magic number), bukan hanya ekstensi/MIME
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
  const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP";
  if (!(isJpg || isPng || isWebp)) return fail("Isi file bukan gambar yang valid.");
  const name = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
  try {
    return await saveFile(name, buf, file.type);
  } catch (e) {
    console.error(e);
    return fail("Gagal menyimpan gambar. Periksa pengaturan penyimpanan (Supabase Storage / folder storage).");
  }
}

export async function saveLandingDraft(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const current = await getLandingDraft();
  const next: LandingContent = {
    ...current,
    heroTitle: str(fd, "heroTitle") || current.heroTitle,
    heroSubtitle: str(fd, "heroSubtitle"),
    heroDescription: str(fd, "heroDescription"),
    ctaText: str(fd, "ctaText") || "Masuk ke SIGAP",
    heroPosition: ["center", "top", "bottom", "left", "right"].includes(str(fd, "heroPosition")) ? str(fd, "heroPosition") : "center",
    overlayOpacity: Math.min(90, Math.max(0, int(fd, "overlayOpacity") || 0)),
    aboutTitle: str(fd, "aboutTitle"),
    aboutText: str(fd, "aboutText"),
    benefits: str(fd, "benefits").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 8),
    contactName: str(fd, "contactName"),
    contactEmail: str(fd, "contactEmail"),
    contactPhone: str(fd, "contactPhone"),
    contactAddress: str(fd, "contactAddress"),
    footerText: str(fd, "footerText"),
    version: str(fd, "version") || current.version,
  };
  const hero = fd.get("heroFile");
  if (hero instanceof File && hero.size > 0) {
    const r = await storeUpload(hero);
    if (typeof r !== "string") return r;
    next.heroImage = r;
  }
  const logo = fd.get("logoFile");
  if (logo instanceof File && logo.size > 0) {
    const r = await storeUpload(logo);
    if (typeof r !== "string") return r;
    next.logo = r;
  }
  if (fd.get("removeLogo") === "on") next.logo = "";
  if (fd.get("defaultHero") === "on") next.heroImage = DEFAULTS.landing.heroImage;
  await setSetting("landing_draft", next);
  await logAudit(admin, "DRAFT", "Tampilan Website", { detail: "Draft tampilan landing page disimpan" });
  revalidatePath("/admin/pengaturan/tampilan");
  return ok("Draft disimpan. Periksa preview lalu klik Publikasikan.");
}

export async function publishLanding(_: ActionResult): Promise<ActionResult> {
  const admin = await requireAdmin();
  const draft = await getLandingDraft();
  await setSetting("landing", draft);
  await db.insert(siteContentVersions).values({ content: draft, publishedBy: admin.name });
  await logAudit(admin, "PUBLISH", "Tampilan Website", { detail: "Tampilan landing page dipublikasikan" });
  revalidatePath("/", "layout");
  return ok("Tampilan website dipublikasikan.");
}

export async function restoreLanding(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const v = await db.query.siteContentVersions.findFirst({ where: eq(siteContentVersions.id, id) });
  if (!v) return fail("Versi tidak ditemukan.");
  await setSetting("landing", v.content);
  await setSetting("landing_draft", v.content);
  await db.insert(siteContentVersions).values({ content: v.content, publishedBy: `${admin.name} (pemulihan)` });
  await logAudit(admin, "RESTORE", "Tampilan Website", { detail: `Dikembalikan ke versi ${v.createdAt.toISOString()}` });
  revalidatePath("/", "layout");
  return ok("Tampilan dikembalikan ke versi sebelumnya dan dipublikasikan.");
}

export async function discardDraft(_: ActionResult): Promise<ActionResult> {
  await requireAdmin();
  const latest = await db.query.siteContentVersions.findFirst({ orderBy: desc(siteContentVersions.createdAt) });
  await setSetting("landing_draft", latest?.content ?? (await getSetting("landing")));
  revalidatePath("/admin/pengaturan/tampilan");
  return ok("Draft dikembalikan ke versi yang sedang tayang.");
}
