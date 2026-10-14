"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { assignmentHistory, assignments, personnel, units } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { dbError, fail, ok, optStr, str, type ActionResult } from "@/lib/action";
import { formatDate, isValidDate } from "@/lib/dates";
import { availabilityFor, notifyPersonnel } from "@/lib/operations";
import { logAudit } from "@/lib/audit";
import { unitCategoryLabel, SHIFT_SHORT } from "@/lib/constants";

type Shift = "PAGI" | "MALAM";

function parseCommon(fd: FormData) {
  const date = str(fd, "date");
  const shift = str(fd, "shift") as Shift;
  if (!isValidDate(date) || !["PAGI", "MALAM"].includes(shift)) return null;
  return { date, shift };
}

/** Tetapkan / ganti operator pada sebuah unit (termasuk Quick Replacement). */
export async function assignOperator(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const c = parseCommon(fd);
  if (!c) return fail("Tanggal/shift tidak valid.");
  const unitId = str(fd, "unitId");
  const personnelId = str(fd, "personnelId");
  const reason = optStr(fd, "reason");
  const force = fd.get("force") === "on";
  if (!personnelId) return fail("Pilih operator.");

  const unit = await db.query.units.findFirst({ where: eq(units.id, unitId) });
  const person = await db.query.personnel.findFirst({ where: eq(personnel.id, personnelId) });
  if (!unit || !person) return fail("Unit atau operator tidak ditemukan.");
  if (unit.status === "BREAKDOWN") return fail(`${unit.code} sedang breakdown dan tidak dapat ditugaskan.`);

  // ── Assignment Validation ──
  const avail = (await availabilityFor(c.date, c.shift, person.category)).find((a) => a.id === person.id);
  if (!avail) return fail("Personel tidak aktif.");
  if (avail.assignedUnit && avail.assignedUnit !== unit.code) {
    return fail(`${person.name} sudah ditugaskan pada ${avail.assignedUnit} di shift yang sama. Satu operator tidak boleh memegang dua unit.`);
  }
  const hard = ["Sedang sakit", "Sedang cuti periodik", "Akun nonaktif"];
  if (avail.reason && (hard.includes(avail.reason) || avail.reason.startsWith("Sudah bertugas"))) {
    return fail(`${person.name} tidak dapat ditugaskan: ${avail.reason}.`);
  }
  const warnings: string[] = [];
  if (avail.reason) warnings.push(avail.reason);
  if (!person.skills.includes(unit.category)) warnings.push(`tidak memiliki skill ${unitCategoryLabel(unit.category)}`);
  if (warnings.length && !force) {
    return fail(`Perhatian: ${person.name} ${warnings.join(", ")}. Centang "Abaikan peringatan" untuk tetap menugaskan.`);
  }

  const existing = await db.query.assignments.findFirst({
    where: and(eq(assignments.date, c.date), eq(assignments.shift, c.shift), eq(assignments.unitId, unitId)),
    with: { personnel: true },
  });
  try {
    if (existing) {
      if (existing.personnelId === personnelId) return ok("Tidak ada perubahan.");
      const wasPublished = existing.status !== "DRAFT";
      if (wasPublished && !reason) return fail("Quick Replacement pada penugasan yang sudah dipublikasikan wajib menyertakan alasan.");
      await db
        .update(assignments)
        .set({ personnelId, status: wasPublished ? "CHANGED" : "DRAFT", note: reason })
        .where(eq(assignments.id, existing.id));
      await db.insert(assignmentHistory).values({
        date: c.date, shift: c.shift, unitCode: unit.code, action: wasPublished ? "QUICK_REPLACEMENT" : "UBAH",
        previousPersonnel: `${existing.personnel.name} (${existing.personnel.employeeNo})`,
        newPersonnel: `${person.name} (${person.employeeNo})`, reason, changedBy: admin.name,
      });
      if (wasPublished) {
        await notifyPersonnel([existing.personnelId], { type: "ASSIGNMENT_CHANGED", title: "Penugasan dibatalkan", message: `Penugasan Anda pada ${unit.code} (${formatDate(c.date)}, Shift ${SHIFT_SHORT[c.shift]}) dialihkan ke operator lain.` });
        await notifyPersonnel([personnelId], { type: "ASSIGNMENT_CHANGED", title: "Penugasan baru", message: `Anda ditugaskan pada ${unit.code} — ${unit.model} (${formatDate(c.date)}, Shift ${SHIFT_SHORT[c.shift]}).` });
      }
    } else {
      await db.insert(assignments).values({ date: c.date, shift: c.shift, personnelId, unitId, fleetId: unit.fleetId, pitId: unit.pitId, status: "DRAFT" });
      await db.insert(assignmentHistory).values({ date: c.date, shift: c.shift, unitCode: unit.code, action: "TAMBAH", newPersonnel: `${person.name} (${person.employeeNo})`, changedBy: admin.name });
    }
  } catch (e) {
    return dbError(e);
  }
  revalidatePath("/admin/penugasan");
  return ok(existing && existing.status !== "DRAFT" ? `Quick Replacement: ${unit.code} kini dioperasikan ${person.name}.` : `${person.name} → ${unit.code} (draft).`);
}

export async function removeAssignment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const a = await db.query.assignments.findFirst({ where: eq(assignments.id, id), with: { personnel: true, unit: true } });
  if (!a) return fail("Penugasan tidak ditemukan.");
  await db.delete(assignments).where(eq(assignments.id, id));
  await db.insert(assignmentHistory).values({ date: a.date, shift: a.shift, unitCode: a.unit.code, action: "HAPUS", previousPersonnel: `${a.personnel.name} (${a.personnel.employeeNo})`, reason: optStr(fd, "reason"), changedBy: admin.name });
  if (a.status !== "DRAFT") {
    await notifyPersonnel([a.personnelId], { type: "ASSIGNMENT_CHANGED", title: "Penugasan dibatalkan", message: `Penugasan Anda pada ${a.unit.code} (${formatDate(a.date)}, Shift ${SHIFT_SHORT[a.shift]}) dibatalkan.` });
  }
  revalidatePath("/admin/penugasan");
  return ok(`Penugasan ${a.unit.code} dihapus.`);
}

/** Isi otomatis unit kosong dengan operator tersedia yang memiliki skill sesuai (sebagai DRAFT). */
export async function autoFill(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const c = parseCommon(fd);
  if (!c) return fail("Tanggal/shift tidak valid.");
  const pitId = optStr(fd, "pitId");
  const opUnits = (await db.select().from(units).where(eq(units.status, "OPERASI"))).filter((u) => !pitId || u.pitId === pitId);
  const existing = await db.select().from(assignments).where(and(eq(assignments.date, c.date), eq(assignments.shift, c.shift)));
  const filled = new Set(existing.map((a) => a.unitId));
  const avail = (await availabilityFor(c.date, c.shift)).filter((a) => a.available && !a.assignedUnit);
  // Prioritaskan operator yang kemarin memegang unit yang sama
  const yesterday = new Date(`${c.date}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const prev = await db.select().from(assignments).where(eq(assignments.date, yesterday.toISOString().slice(0, 10)));
  const used = new Set<string>();
  const rows: (typeof assignments.$inferInsert)[] = [];
  // Unit dengan kandidat paling sedikit diisi lebih dulu
  const empty = opUnits.filter((u) => !filled.has(u.id)).sort((a, b) => avail.filter((x) => x.skills.includes(a.category)).length - avail.filter((x) => x.skills.includes(b.category)).length);
  for (const u of empty) {
    const prevOp = prev.find((p) => p.unitId === u.id && p.shift === c.shift);
    const cand =
      avail.find((a) => a.id === prevOp?.personnelId && !used.has(a.id)) ??
      avail.filter((a) => !used.has(a.id) && a.skills.includes(u.category)).sort((x, y) => x.skills.length - y.skills.length)[0];
    if (!cand) continue;
    used.add(cand.id);
    rows.push({ date: c.date, shift: c.shift, personnelId: cand.id, unitId: u.id, fleetId: u.fleetId, pitId: u.pitId, status: "DRAFT" });
  }
  if (!rows.length) return fail("Tidak ada kombinasi unit kosong & operator tersedia yang sesuai skill.");
  await db.insert(assignments).values(rows).onConflictDoNothing();
  await logAudit(admin, "AUTOFILL", "Penugasan", { detail: `${c.date} ${c.shift}: ${rows.length} draft dibuat otomatis` });
  revalidatePath("/admin/penugasan");
  const left = empty.length - rows.length;
  return ok(`${rows.length} penugasan draft dibuat.${left ? ` ${left} unit masih kosong (tidak ada operator sesuai skill).` : ""} Tinjau lalu publikasikan.`);
}

/** Publikasikan draft — hanya penugasan terpublikasi yang tampil di portal operator. */
export async function publishAssignments(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const c = parseCommon(fd);
  if (!c) return fail("Tanggal/shift tidak valid.");
  const pitId = optStr(fd, "pitId");
  const drafts = (
    await db.query.assignments.findMany({
      where: and(eq(assignments.date, c.date), eq(assignments.shift, c.shift), eq(assignments.status, "DRAFT")),
      with: { unit: true, personnel: true },
    })
  ).filter((a) => !pitId || a.pitId === pitId);
  if (!drafts.length) return fail("Tidak ada draft untuk dipublikasikan.");

  // Validasi akhir: status personel
  const avail = await availabilityFor(c.date, c.shift);
  const blocked = drafts.filter((d) => {
    const a = avail.find((x) => x.id === d.personnelId);
    return !a || ["Sedang sakit", "Sedang cuti periodik", "Akun nonaktif"].includes(a.reason ?? "");
  });
  if (blocked.length) {
    return fail(`Tidak dapat dipublikasikan: ${blocked.map((b) => `${b.personnel.name} (${b.unit.code})`).join(", ")} tidak tersedia. Lakukan penggantian terlebih dahulu.`);
  }
  await db.update(assignments).set({ status: "PUBLISHED" }).where(inArray(assignments.id, drafts.map((d) => d.id)));
  await db.insert(assignmentHistory).values(drafts.map((d) => ({ date: c.date, shift: c.shift, unitCode: d.unit.code, action: "PUBLISH", newPersonnel: `${d.personnel.name} (${d.personnel.employeeNo})`, changedBy: admin.name })));
  for (const d of drafts) {
    await notifyPersonnel([d.personnelId], {
      key: `asg:${d.id}`,
      type: "ASSIGNMENT_PUBLISHED",
      title: "Penugasan dipublikasikan",
      message: `${formatDate(c.date)}, Shift ${SHIFT_SHORT[c.shift]}: ${d.unit.code} — ${d.unit.model}.`,
    });
  }
  await logAudit(admin, "PUBLISH", "Penugasan", { detail: `${c.date} ${c.shift}: ${drafts.length} penugasan dipublikasikan` });
  revalidatePath("/admin/penugasan");
  return ok(`${drafts.length} penugasan dipublikasikan dan tampil di portal operator.`);
}
