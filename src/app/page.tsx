import Link from "next/link";
import { Users, Truck, CalendarDays, FileBarChart2, ArrowRight, ShieldCheck, BellRing, Mail, Phone, MapPin, CheckCircle2, Menu } from "lucide-react";
import { getSetting } from "@/lib/settings";
import { Logo } from "@/components/logo";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: Users,
    title: "Manajemen Manpower",
    text: "Data operator & lima jenis Group Leader, skill unit, status kerja, dan akun dalam satu tempat.",
  },
  {
    icon: Truck,
    title: "Pengelolaan Fleet & Unit",
    text: "Master unit alat berat, konfigurasi fleet, lokasi loading, dan riwayat perpindahan unit antar-PIT.",
  },
  {
    icon: CalendarDays,
    title: "Roster & Jadwal Kerja",
    text: "Roster otomatis pola 7 Pagi – 6 Malam – 1 Libur, pengaturan jam shift, dan cuti periodik.",
  },
  {
    icon: FileBarChart2,
    title: "Laporan Operasional",
    text: "Delapan jenis laporan dengan filter periode, lokasi, dan shift — siap ekspor PDF & Excel.",
  },
];

export default async function LandingPage() {
  const c = await getSetting("landing");
  const nav = [
    { href: "#beranda", label: "Beranda" },
    { href: "#tentang", label: "Tentang SIGAP" },
    { href: "#fitur", label: "Fitur" },
    { href: "#kontak", label: "Kontak" },
  ];
  return (
    <div className="bg-white">
      {/* Navigation */}
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <a href="#beranda">
            <Logo src={c.logo || undefined} />
          </a>
          <nav className="hidden items-center gap-8 md:flex">
            {nav.map((n) => (
              <a key={n.href} href={n.href} className="text-sm font-semibold text-gray-600 transition hover:text-brand">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn-primary">
              Masuk
            </Link>
            <details className="relative md:hidden">
              <summary className="btn-ghost list-none px-2" aria-label="Menu">
                <Menu className="h-5 w-5" />
              </summary>
              <div className="absolute right-0 mt-2 w-48 rounded-xl border border-gray-100 bg-white p-2 shadow-lg">
                {nav.map((n) => (
                  <a key={n.href} href={n.href} className="block rounded-lg px-3 py-2 text-sm font-medium text-navy hover:bg-gray-50">
                    {n.label}
                  </a>
                ))}
              </div>
            </details>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section id="beranda" className="relative isolate overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={c.heroImage}
          alt="Operasional pertambangan"
          className="absolute inset-0 -z-20 h-full w-full object-cover"
          style={{ objectPosition: c.heroPosition }}
        />
        <div className="absolute inset-0 -z-10 bg-navy" style={{ opacity: c.overlayOpacity / 100 }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-navy/80 via-navy/30 to-transparent" />
        <div className="mx-auto flex min-h-[78vh] max-w-7xl flex-col justify-center px-4 py-24 sm:px-6">
          <span className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white/90">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" /> {c.heroSubtitle}
          </span>
          <h1 className="max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
            {c.heroTitle}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/85 sm:text-lg">{c.heroDescription}</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/login" className="btn-primary px-6 py-3 text-base">
              {c.ctaText} <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#fitur" className="btn border border-white/30 px-6 py-3 text-base text-white hover:bg-white/10">
              Lihat Fitur
            </a>
          </div>
          <div className="mt-14 grid max-w-2xl grid-cols-3 gap-6 border-t border-white/15 pt-8 text-white">
            <div>
              <p className="text-2xl font-extrabold sm:text-3xl">7-6-1</p>
              <p className="text-xs text-white/70 sm:text-sm">Pola roster otomatis</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold sm:text-3xl">H-30</p>
              <p className="text-xs text-white/70 sm:text-sm">Peringatan dini cuti</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold sm:text-3xl">2 Shift</p>
              <p className="text-xs text-white/70 sm:text-sm">Pagi & malam terpantau</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="fitur" className="bg-surface py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-wider text-brand">Fitur Unggulan</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-navy">Semua kebutuhan administrasi operasional, terintegrasi</h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="card group p-6 transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="mb-5 inline-flex rounded-xl bg-brand-light p-3 text-brand transition group-hover:bg-brand group-hover:text-white">
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-navy">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About */}
      <section id="tentang" className="py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-brand">Tentang SIGAP</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-navy">{c.aboutTitle}</h2>
            <p className="mt-5 leading-relaxed text-gray-600">{c.aboutText}</p>
            <ul className="mt-6 space-y-3">
              {c.benefits.map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm font-medium text-navy">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand" /> {b}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-navy p-6 text-white sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Siklus Roster 14 Hari</p>
              <div className="mt-4 grid grid-cols-7 gap-1.5 sm:grid-cols-14">
                {Array.from({ length: 14 }, (_, i) => {
                  const code = i < 7 ? "P" : i < 13 ? "M" : "L";
                  const cls = code === "P" ? "bg-emerald-500" : code === "M" ? "bg-blue-500" : "bg-brand";
                  return (
                    <div key={i} className="text-center">
                      <div className={`rounded-md py-2 text-xs font-bold ${cls}`}>{code}</div>
                      <div className="mt-1 text-[10px] text-white/50">H{i + 1}</div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-xs text-white/70">7 hari Shift Pagi · 6 hari Shift Malam · 1 hari Libur</p>
            </div>
            <div className="card p-5">
              <BellRing className="h-6 w-6 text-brand" />
              <p className="mt-3 font-bold text-navy">Early Warning</p>
              <p className="mt-1 text-sm text-gray-600">Notifikasi cuti periodik H-30, H-14, H-7, H-3, dan H-1.</p>
            </div>
            <div className="card p-5">
              <ShieldCheck className="h-6 w-6 text-brand" />
              <p className="mt-3 font-bold text-navy">Akses Berbasis Peran</p>
              <p className="mt-1 text-sm text-gray-600">Setiap pengguna hanya melihat data sesuai kewenangannya.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="kontak" className="bg-surface py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="rounded-3xl bg-gradient-to-br from-navy to-navy-light p-8 text-white sm:p-12">
            <div className="grid gap-10 lg:grid-cols-2">
              <div>
                <h2 className="text-2xl font-extrabold sm:text-3xl">Butuh akses atau bantuan akun?</h2>
                <p className="mt-3 text-white/75">
                  Akun SIGAP dibuat oleh administrator. Hubungi {c.contactName} untuk pembuatan akun, reset password, atau aktivasi ulang.
                </p>
                <Link href="/login" className="btn-primary mt-6">
                  {c.ctaText} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="space-y-4 text-sm">
                <p className="flex items-center gap-3"><Mail className="h-5 w-5 text-white/60" /> {c.contactEmail}</p>
                <p className="flex items-center gap-3"><Phone className="h-5 w-5 text-white/60" /> {c.contactPhone}</p>
                <p className="flex items-center gap-3"><MapPin className="h-5 w-5 text-white/60" /> {c.contactAddress}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Logo src={c.logo || undefined} />
            <p className="mt-3 max-w-md text-sm text-gray-500">{c.footerText}</p>
          </div>
          <div className="text-sm text-gray-500 md:text-right">
            <p>Versi aplikasi {c.version}</p>
            <p className="mt-1">© {new Date().getFullYear()} SIGAP — Sistem Informasi Gerak dan Penugasan</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
