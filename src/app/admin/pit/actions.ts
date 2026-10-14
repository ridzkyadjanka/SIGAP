"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { fleets, pits, unitMovements, units } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { dbError, fail, ok, optStr, str, type ActionResult } from "@/lib/action";
import { logAudit } from "@/lib/audit";

export async function savePit(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = optStr(fd, "id");
  const code = str(fd, "code").toUpperCase();
  const name = str(fd, "name");
  if (!code || !name) return fail("Kode dan nama PIT wajib diisi.");
  const values = {
    code,
    name,
    loadingPoint: optStr(fd, "loadingPoint"),
    dumpingPoint: optStr(fd, "dumpingPoint"),
    description: optStr(fd, "description"),
    leaderId: optStr(fd, "leaderId"),
  };
  const fleetIds = fd.getAll("fleetIds").map(String);
  try {
    let pitId = id;
    if (id) {
      await db.update(pits).set(values).where(eq(pits.id, id));
    } else {
      const [p] = await db.insert(pits).values(values).returning();
      pitId = p.id;
    }
    // Fleet yang beroperasi di PIT ini (beserta unitnya)
    if (fleetIds.length) {
      const moving = await db.query.fleets.findMany({ where: inArray(fleets.id, fleetIds), with: { pit: true, units: true } });
      for (const f of moving.filter((f) => f.pitId !== pitId)) {
        await db.update(fleets).set({ pitId }).where(eq(fleets.id, f.id));
        for (const u of f.units) {
          await db.update(units).set({ pitId }).where(eq(units.id, u.id));
          await db.insert(unitMovements).values({ unitId: u.id, fromPit: f.pit?.code ?? null, toPit: code, fromFleet: f.code, toFleet: f.code, note: "Fleet dipindahkan via Lokasi/PIT", movedBy: admin.name });
        }
      }
    }
    await logAudit(admin, id ? "UPDATE" : "CREATE", "PIT", { entityId: pitId, detail: `${code} — ${name}` });
  } catch (e) {
    return dbError(e);
  }
  revalidatePath("/admin/pit");
  return ok(id ? "PIT diperbarui." : "PIT baru ditambahkan.");
}
