import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export async function logAudit(
  actor: { id: string; name: string } | null,
  action: string,
  entity: string,
  opts: { entityId?: string | null; detail?: string | null; reason?: string | null } = {}
) {
  await db.insert(auditLogs).values({
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? "Sistem",
    action,
    entity,
    entityId: opts.entityId ?? null,
    detail: opts.detail ?? null,
    reason: opts.reason ?? null,
  });
}
