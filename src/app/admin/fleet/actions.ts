"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { fleets, pits, unitMovements, units } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { dbError, fail, ok, optStr, str, type ActionResult } from "@/lib/action";
import { logAudit } from "@/lib/audit";
import { UNIT_CATEGORIES } from "@/lib/constants";

const STATUS = ["OPERASI", "STANDBY", "BREAKDOWN"] as const;

async function names(pitId: string | null, fleetId: string | null) {
  const p = pitId ? await db.query.pits.findFirst({ where: eq(pits.id, pitId) }) : null;
  const f = fleetId ? await db.query.fleets.findFirst({ where: eq(fleets.id, fleetId) }) : null;
  return { pit: p?.code ?? null, fleet: f?.code ?? null, fleetPitId: f?.pitId ?? null };
}

export async function saveUnit(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = optStr(fd, "id");
  const code = str(fd, "code").toUpperCase();
  const category = str(fd, "category");
  const model = str(fd, "model");
  const status = str(fd, "status") as (typeof STATUS)[number];
  const fleetId = optStr(fd, "fleetId");
  let pitId = optStr(fd, "pitId");
  const notes = optStr(fd, "notes");
  if (!code) return fail("Nomor unit wajib diisi.");
  if (!UNIT_CATEGORIES.some((c) => c.value === category)) return fail("Jenis unit tidak valid.");
  if (!model) return fail("Model wajib diisi.");
  if (!STATUS.includes(status)) return fail("Status tidak valid.");
  const n = await names(pitId, fleetId);
  // Unit dalam fleet mengikuti PIT fleet tersebut
  if (fleetId && n.fleetPitId) pitId = n.fleetPitId;
  try {
    if (id) {
      const before = await db.query.units.findFirst({ where: eq(units.id, id), with: { pit: true, fleet: true } });
      if (!before) return fail("Unit tidak ditemukan.");
      await db.update(units).set({ code, category, model, status, fleetId, pitId, notes }).where(eq(units.id, id));
      if (before.pitId !== pitId || before.fleetId !== fleetId) {
        const after = await names(pitId, fleetId);
        await db.insert(unitMovements).values({
          unitId: id,
          fromPit: before.pit?.code ?? null,
          toPit: after.pit,
          fromFleet: before.fleet?.code ?? null,
          toFleet: after.fleet,
          note: optStr(fd, "moveNote"),
          movedBy: admin.name,
        });
      }
      await logAudit(admin, "UPDATE", "Unit", { entityId: id, detail: `${code} diperbarui (status ${status})` });
    } else {
      const [u] = await db.insert(units).values({ code, category, model, status, fleetId, pitId, notes }).returning();
      await logAudit(admin, "CREATE", "Unit", { entityId: u.id, detail: `${code} ${model} ditambahkan` });
    }
  } catch (e) {
    return dbError(e);
  }
  revalidatePath("/admin/fleet", "layout");
  return ok(id ? "Unit diperbarui." : "Unit ditambahkan.");
}

export async function setUnitStatus(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const status = str(fd, "status") as (typeof STATUS)[number];
  if (!STATUS.includes(status)) return fail("Status tidak valid.");
  const [u] = await db.update(units).set({ status }).where(eq(units.id, id)).returning();
  if (!u) return fail("Unit tidak ditemukan.");
  await logAudit(admin, "STATUS", "Unit", { entityId: id, detail: `${u.code} → ${status}` });
  revalidatePath("/admin/fleet", "layout");
  return ok(`Status ${u.code} diperbarui.`);
}

export async function saveFleet(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = optStr(fd, "id");
  const code = str(fd, "code").toUpperCase();
  const name = str(fd, "name");
  const pitId = optStr(fd, "pitId");
  const loadingPoint = optStr(fd, "loadingPoint");
  const unitIds = fd.getAll("unitIds").map(String);
  if (!code || !name) return fail("Kode dan nama fleet wajib diisi.");
  try {
    let fleetId = id;
    let pitChanged = false;
    if (id) {
      const before = await db.query.fleets.findFirst({ where: eq(fleets.id, id) });
      if (!before) return fail("Fleet tidak ditemukan.");
      pitChanged = before.pitId !== pitId;
      await db.update(fleets).set({ code, name, pitId, loadingPoint }).where(eq(fleets.id, id));
    } else {
      const [f] = await db.insert(fleets).values({ code, name, pitId, loadingPoint }).returning();
      fleetId = f.id;
    }
    // Sinkronkan anggota fleet
    const current = await db.select().from(units).where(eq(units.fleetId, fleetId!));
    const pitCode = pitId ? (await db.query.pits.findFirst({ where: eq(pits.id, pitId) }))?.code ?? null : null;
    const removed = current.filter((u) => !unitIds.includes(u.id));
    for (const u of removed) {
      await db.update(units).set({ fleetId: null }).where(eq(units.id, u.id));
      await db.insert(unitMovements).values({ unitId: u.id, fromFleet: code, toFleet: null, note: "Dikeluarkan dari fleet", movedBy: admin.name });
    }
    if (unitIds.length) {
      const incoming = await db.query.units.findMany({ where: inArray(units.id, unitIds), with: { pit: true, fleet: true } });
      for (const u of incoming) {
        const isNew = u.fleetId !== fleetId;
        const movePit = pitId && u.pitId !== pitId;
        if (!isNew && !movePit) continue;
        await db.update(units).set({ fleetId, pitId: pitId ?? u.pitId }).where(eq(units.id, u.id));
        await db.insert(unitMovements).values({
          unitId: u.id,
          fromFleet: u.fleet?.code ?? null,
          toFleet: code,
          fromPit: u.pit?.code ?? null,
          toPit: pitCode ?? u.pit?.code ?? null,
          note: pitChanged && !isNew ? "Fleet dipindahkan ke PIT lain" : "Dimasukkan ke fleet",
          movedBy: admin.name,
        });
      }
    }
    await logAudit(admin, id ? "UPDATE" : "CREATE", "Fleet", { entityId: fleetId, detail: `${code} — ${unitIds.length} unit` });
  } catch (e) {
    return dbError(e);
  }
  revalidatePath("/admin/fleet", "layout");
  return ok(id ? "Konfigurasi fleet disimpan." : "Fleet baru dibuat.");
}

export async function deleteFleet(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const f = await db.query.fleets.findFirst({ where: eq(fleets.id, id) });
  if (!f) return fail("Fleet tidak ditemukan.");
  await db.update(units).set({ fleetId: null }).where(eq(units.fleetId, id));
  await db.delete(fleets).where(eq(fleets.id, id));
  await logAudit(admin, "DELETE", "Fleet", { entityId: id, detail: `${f.code} dihapus, unit dilepas dari fleet` });
  revalidatePath("/admin/fleet", "layout");
  return ok("Fleet dihapus.");
}
