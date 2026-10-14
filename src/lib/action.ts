export type ActionResult = { ok: boolean; message: string; data?: unknown } | null;
export type FormAction = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

export function ok(message: string, data?: unknown): ActionResult {
  return { ok: true, message, data };
}
export function fail(message: string): ActionResult {
  return { ok: false, message };
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}
export function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
}
export function num(fd: FormData, key: string): number {
  return Number(str(fd, key));
}

/** Ubah error database menjadi pesan yang dapat dipahami admin. */
export function dbError(e: unknown, fallback = "Terjadi kesalahan saat menyimpan data."): ActionResult {
  const err = e as { code?: string; constraint?: string; message?: string; cause?: { code?: string; constraint?: string } };
  const code = err?.code ?? err?.cause?.code;
  const constraint = err?.constraint ?? err?.cause?.constraint ?? "";
  if (code === "23505") {
    if (constraint.includes("employee_no")) return fail("Nomor pegawai sudah terdaftar.");
    if (constraint.includes("assignment_person")) return fail("Operator sudah ditugaskan pada shift tersebut.");
    if (constraint.includes("assignment_unit")) return fail("Unit sudah memiliki operator pada shift tersebut.");
    if (constraint.includes("code")) return fail("Kode sudah digunakan.");
    return fail("Data duplikat — nilai yang sama sudah ada.");
  }
  if (err?.message?.startsWith("Hanya Super Admin")) return fail(err.message);
  console.error(e);
  return fail(fallback);
}
