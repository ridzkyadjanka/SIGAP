"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { ok, str, type ActionResult } from "@/lib/action";
import { runMaintenance } from "@/lib/operations";

export async function markRead(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = str(fd, "id");
  if (id) await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.id, id), eq(notifications.forAdmin, true)));
  else await db.update(notifications).set({ isRead: true }).where(eq(notifications.forAdmin, true));
  revalidatePath("/admin", "layout");
  return ok("Ditandai sudah dibaca.");
}

export async function refreshNotifications(_: ActionResult): Promise<ActionResult> {
  await requireAdmin();
  await runMaintenance(true);
  revalidatePath("/admin", "layout");
  return ok("Notifikasi diperbarui.");
}
