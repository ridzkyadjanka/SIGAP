// Utilitas tanggal. Semua tanggal operasional disimpan sebagai string "YYYY-MM-DD"
// dan dihitung dalam zona waktu operasional (default Asia/Jakarta / WIB).

export const APP_TZ = process.env.APP_TIMEZONE || "Asia/Jakarta";

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const HARI_PENDEK = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export function todayStr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Jam saat ini (HH:MM) di zona waktu operasional. */
export function nowTimeStr(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function toUTC(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

export function fromUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: string, n: number): string {
  const d = toUTC(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTC(d);
}

/** Selisih hari b - a. */
export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86400000);
}

export function isValidDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(toUTC(s).getTime());
}

export function dayName(s: string, short = false): string {
  const d = toUTC(s).getUTCDay();
  return short ? HARI_PENDEK[d] : HARI[d];
}

export function dayOfWeek(s: string): number {
  return toUTC(s).getUTCDay();
}

export function formatDate(s: string | null | undefined, opts: { withDay?: boolean; short?: boolean } = {}): string {
  if (!s) return "-";
  const d = toUTC(s);
  const month = opts.short ? BULAN_PENDEK[d.getUTCMonth()] : BULAN[d.getUTCMonth()];
  const base = `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
  return opts.withDay ? `${dayName(s)}, ${base}` : base;
}

export function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: APP_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function monthLabel(year: number, month: number): string {
  return `${BULAN[month - 1]} ${year}`;
}

export function monthRange(year: number, month: number): { start: string; end: string; days: string[] } {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days: string[] = [];
  for (let i = 0; i < last; i++) days.push(addDays(start, i));
  return { start, end: days[days.length - 1], days };
}

export function rangeDays(start: string, end: string): string[] {
  const out: string[] = [];
  const n = diffDays(start, end);
  for (let i = 0; i <= n && i < 400; i++) out.push(addDays(start, i));
  return out;
}

/** Password awal: tanggal lahir format DDMMYYYY. */
export function birthDatePassword(birthDate: string): string {
  const [y, m, d] = birthDate.split("-");
  return `${d}${m}${y}`;
}

export function parseMonthParam(v: string | undefined): { year: number; month: number } {
  const t = todayStr();
  if (v && /^\d{4}-\d{2}$/.test(v)) {
    const [y, m] = v.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m };
  }
  return { year: Number(t.slice(0, 4)), month: Number(t.slice(5, 7)) };
}

export function shiftMonth(year: number, month: number, delta: number): string {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
