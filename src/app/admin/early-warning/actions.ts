"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accountDeactivations, assignments, leaves, personnel, replacements, units, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { fail, ok, optStr, str, type ActionResult } from "@/lib/action";
import { formatDate, isValidDate, rangeDays, todayStr } from "@/lib/dates";
import { hasOverlappingLeave, loadRosterContext, rosterCode } from "@/lib/roster";
import { notifyPersonnel, replacementCandidates } from "@/lib/operations";
import { logAudit } from "@/lib/audit";

/** Simpan pengganti terpilih (setelah review admin). Jika cuti belum dijadwalkan, sekaligus menetapkan jadwal cuti. */
export async function saveReplacement(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const personId = str(fd, "personId");
  const candidateId = str(fd, "candidateId");
  const start = str(fd, "start");
  const end = str(fd, "end");
  const unitCode = optStr(fd, "unitCode");
  const skill = optStr(fd, "skill");
  const note = optStr(fd, "note");
  const createDrafts = fd.get("createDrafts") === "on";
  if (!candidateId) return fail("Pilih kandidat pengganti.");
  if (!isValidDate(start) || !isValidDate(end) || end < start) return fail("Periode penugasan tidak valid.");

  const target = await db.query.personnel.findFirst({ where: eq(personnel.id, personId) });
  const cand = await db.query.personnel.findFirst({ where: eq(personnel.id, candidateId) });
  if (!target || !cand) return fail("Personel tidak ditemukan.");
  // Validasi ulang di backend
  const check = (await replacementCandidates({ personId, start, end, skill })).find((c) => c.id === candidateId);
  if (!check) return fail(`${cand.name} tidak memenuhi kesesuaian skill/jabatan.`);
  if (!check.eligible && fd.get("force") !== "on") return fail(`${cand.name}: ${check.conflicts.join(", ")}. Centang "Abaikan" untuk tetap memilih.`);

  // Pastikan cuti tercatat
  let leave = await db.query.leaves.findFirst({
    where: (l, { and, eq, inArray, lte, gte }) => and(eq(l.personnelId, personId), inArray(l.status, ["DIJADWALKAN", "BERLANGSUNG"]), lte(l.startDate, end), gte(l.endDate, start)),
  });
  if (!leave) {
    if (await hasOverlappingLeave(personId, start, end)) return fail("Periode beririsan dengan cuti lain.");
    const today = todayStr();
    [leave] = await db
      .insert(leaves)
      .values({ personnelId: personId, startDate: start, endDate: end, status: start <= today ? "BERLANGSUNG" : "DIJADWALKAN", createdBy: admin.name, note: "Ditetapkan via Replacement Planning" })
      .returning();
    const u = await db.query.users.findFirst({ where: eq(users.personnelId, personId) });
    if (u) await db.insert(accountDeactivations).values({ userId: u.id, reason: "CUTI_PERIODIK", note: `leave:${leave.id}`, startDate: start, endDate: end, createdBy: admin.name });
    await notifyPersonnel([personId], { type: "LEAVE", title: "Cuti periodik ditetapkan", message: `Cuti periodik Anda: ${formatDate(start)} – ${formatDate(end)}.` });
  }
  await db.insert(replacements).values({ leaveId: leave.id, replacementPersonnelId: candidateId, unitCode, startDate: start, endDate: end, note, createdBy: admin.name });

  let drafted = 0;
  if (createDrafts && unitCode) {
    const unit = await db.query.units.findFirst({ where: eq(units.code, unitCode) });
    if (unit) {
      const ctx = await loadRosterContext([candidateId]);
      for (const d of rangeDays(start, end)) {
        const c = rosterCode(cand, ctx, d);
        if (c !== "P" && c !== "M") continue;
        const shift = c === "P" ? "PAGI" : "MALAM";
        const busy = await db.query.assignments.findFirst({
          where: and(eq(assignments.date, d), eq(assignments.shift, shift), eq(assignments.unitId, unit.id)),
        });
        if (busy) continue;
        const res = await db
          .insert(assignments)
          .values({ date: d, shift, personnelId: candidateId, unitId: unit.id, fleetId: unit.fleetId, pitId: unit.pitId, status: "DRAFT", note: `Pengganti ${target.name}` })
          .onConflictDoNothing()
          .returning();
        drafted += res.length;
      }
    }
  }
  await logAudit(admin, "REPLACEMENT", "Cuti", { entityId: leave.id, detail: `${cand.name} menggantikan ${target.name} ${start} – ${end}${unitCode ? ` (${unitCode})` : ""}`, reason: note });
  await notifyPersonnel([candidateId], { type: "REPLACEMENT", title: "Penugasan pengganti", message: `Anda ditunjuk sebagai pengganti ${target.name}${unitCode ? ` pada unit ${unitCode}` : ""} periode ${formatDate(start)} – ${formatDate(end)}.` });
  revalidatePath("/admin", "layout");
  return ok(`${cand.name} ditetapkan sebagai pengganti ${target.name}.${drafted ? ` ${drafted} draft penugasan dibuat — publikasikan di menu Penugasan Harian.` : ""}`);
}

export async function deleteReplacement(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const r = await db.query.replacements.findFirst({ where: eq(replacements.id, id), with: { replacementPersonnel: true } });
  if (!r) return fail("Data tidak ditemukan.");
  await db.delete(replacements).where(eq(replacements.id, id));
  await logAudit(admin, "DELETE", "Pengganti", { entityId: id, detail: `Pengganti ${r.replacementPersonnel.name} dibatalkan` });
  revalidatePath("/admin", "layout");
  return ok("Pengganti dibatalkan.");
}
