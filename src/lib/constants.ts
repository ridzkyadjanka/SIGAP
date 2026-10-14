// Konstanta & label tampilan SIGAP

export const UNIT_CATEGORIES = [
  { value: "DUMP_TRUCK", label: "Dump Truck" },
  { value: "SRT", label: "SRT (Sany SRT100S)" },
  { value: "EXCAVATOR", label: "Excavator" },
  { value: "DOZER", label: "Dozer" },
  { value: "GRADER", label: "Grader" },
  { value: "WHEEL_LOADER", label: "Wheel Loader" },
  { value: "COMPACTOR", label: "Compactor" },
  { value: "WATER_TRUCK", label: "Water Truck" },
] as const;

export const UNIT_MODELS: Record<string, string[]> = {
  DUMP_TRUCK: ["Mercedes-Benz Arocs 4845", "Mercedes-Benz Axor 2528"],
  SRT: ["Sany SRT100S"],
  EXCAVATOR: ["Komatsu PC2000", "Komatsu PC1250", "Komatsu PC500", "Komatsu PC400", "Komatsu PC210"],
  DOZER: ["Komatsu D155", "Komatsu D85"],
  GRADER: ["Komatsu GD825", "Komatsu GD705"],
  WHEEL_LOADER: ["Wheel Loader"],
  COMPACTOR: ["Compactor"],
  WATER_TRUCK: ["Water Truck"],
};

export function unitCategoryLabel(v: string | null | undefined): string {
  return UNIT_CATEGORIES.find((c) => c.value === v)?.label ?? v ?? "-";
}

export const GL_TYPES = [
  { value: "PRODUKSI", label: "GL Produksi" },
  { value: "DEWATERING", label: "GL Dewatering" },
  { value: "MANPOWER", label: "GL Manpower" },
  { value: "OPD", label: "GL OPD" },
  { value: "HAULING", label: "GL Hauling" },
] as const;

export function glTypeLabel(v: string | null | undefined): string {
  return GL_TYPES.find((g) => g.value === v)?.label ?? "-";
}

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN_MANPOWER: "Admin Manpower",
  GROUP_LEADER: "Group Leader",
  OPERATOR: "Operator",
};

export const WORK_STATUS = [
  { value: "AKTIF", label: "Aktif", tone: "green" },
  { value: "SAKIT", label: "Sakit", tone: "orange" },
  { value: "CUTI", label: "Cuti", tone: "blue" },
  { value: "RESIGN", label: "Resign", tone: "gray" },
] as const;

export const UNIT_STATUS = [
  { value: "OPERASI", label: "Beroperasi", tone: "green" },
  { value: "STANDBY", label: "Standby", tone: "orange" },
  { value: "BREAKDOWN", label: "Breakdown", tone: "red" },
] as const;

export const LEAVE_STATUS: Record<string, { label: string; tone: Tone }> = {
  DIJADWALKAN: { label: "Dijadwalkan", tone: "blue" },
  BERLANGSUNG: { label: "Berlangsung", tone: "orange" },
  SELESAI: { label: "Selesai", tone: "green" },
  DIBATALKAN: { label: "Dibatalkan", tone: "gray" },
};

export const DEACTIVATION_REASONS = [
  { value: "SAKIT", label: "Sakit" },
  { value: "CUTI_PERIODIK", label: "Cuti Periodik" },
  { value: "RESIGN", label: "Resign" },
  { value: "ADMINISTRATIF", label: "Penonaktifan Administratif" },
] as const;

export function deactivationLabel(v: string): string {
  return DEACTIVATION_REASONS.find((r) => r.value === v)?.label ?? v;
}

export type Tone = "green" | "orange" | "red" | "blue" | "gray" | "navy";

export const SHIFT_LABEL: Record<string, string> = { PAGI: "Shift 1 — Pagi", MALAM: "Shift 2 — Malam" };
export const SHIFT_SHORT: Record<string, string> = { PAGI: "Pagi", MALAM: "Malam" };

// Kode roster harian
export const ROSTER_CODES: Record<string, { label: string; className: string; dot: string }> = {
  P: { label: "Pagi", className: "bg-emerald-100 text-emerald-800 border-emerald-200", dot: "bg-emerald-500" },
  M: { label: "Malam", className: "bg-blue-100 text-blue-800 border-blue-200", dot: "bg-blue-500" },
  L: { label: "Libur", className: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500" },
  C: { label: "Cuti Periodik", className: "bg-orange-100 text-orange-800 border-orange-200", dot: "bg-orange-500" },
  "-": { label: "Tidak Ada Penugasan", className: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-400" },
};

export const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN_MANPOWER"] as const;
