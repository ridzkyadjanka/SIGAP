import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

export type RosterPattern = { morning: number; night: number; off: number };
export type LeaveRules = { operatorWorkdays: number; glWorkdays: number; durationDays: number };
export type LandingContent = {
  siteTitle: string;
  heroTitle: string;
  heroSubtitle: string;
  heroDescription: string;
  ctaText: string;
  heroImage: string;
  heroPosition: string;
  overlayOpacity: number;
  logo: string;
  aboutTitle: string;
  aboutText: string;
  benefits: string[];
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: string;
  footerText: string;
  version: string;
};

export const DEFAULTS = {
  roster_pattern: { morning: 7, night: 6, off: 1 } as RosterPattern,
  leave_rules: { operatorWorkdays: 70, glWorkdays: 56, durationDays: 14 } as LeaveRules,
  warning_days: [30, 14, 7, 3, 1] as number[],
  login_policy: { maxAttempts: 5, lockMinutes: 15 },
  landing: {
    siteTitle: "SIGAP",
    heroTitle: "SIGAP — Sistem Informasi Gerak dan Penugasan",
    heroSubtitle: "Operational & Workforce Management System",
    heroDescription:
      "Solusi digital untuk pengelolaan manpower, penugasan unit, roster, dan operasional pertambangan secara terintegrasi, akurat, dan efisien.",
    ctaText: "Masuk ke SIGAP",
    heroImage: "/images/hero-mining.svg",
    heroPosition: "center",
    overlayOpacity: 65,
    logo: "",
    aboutTitle: "Satu sistem untuk seluruh pergerakan manpower",
    aboutText:
      "SIGAP menggantikan administrasi manual berbasis Excel, catatan tertulis, dan pesan WhatsApp. Data manpower, unit, fleet, lokasi kerja, shift, roster, dan penugasan dikelola dalam satu sistem terpusat sehingga Admin Manpower tahu siapa yang bertugas hari ini, siapa yang akan cuti, unit mana yang membutuhkan operator, dan siapa yang tersedia sebagai pengganti.",
    benefits: [
      "Roster operator & Group Leader dibuat otomatis",
      "Peringatan dini cuti periodik H-30 hingga H-1",
      "Validasi benturan penugasan secara otomatis",
      "Laporan operasional siap ekspor ke PDF & Excel",
    ],
    contactName: "Admin Manpower",
    contactEmail: "admin.manpower@sigap.local",
    contactPhone: "0711-000000",
    contactAddress: "Site Office, Tanjung Enim, Sumatera Selatan",
    footerText: "Sistem internal operasional pertambangan. Akses hanya untuk personel terdaftar.",
    version: "1.0.0",
  } as LandingContent,
};

type Key = keyof typeof DEFAULTS | "landing_draft";

export async function getSetting<K extends keyof typeof DEFAULTS>(key: K): Promise<(typeof DEFAULTS)[K]> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, key) });
  if (!row) return DEFAULTS[key];
  const def = DEFAULTS[key];
  if (Array.isArray(def)) return row.value as (typeof DEFAULTS)[K];
  return { ...(def as object), ...(row.value as object) } as (typeof DEFAULTS)[K];
}

export async function setSetting(key: Key, value: unknown) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

export async function getLandingDraft(): Promise<LandingContent> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, "landing_draft") });
  if (row) return { ...DEFAULTS.landing, ...(row.value as object) } as LandingContent;
  return getSetting("landing");
}
