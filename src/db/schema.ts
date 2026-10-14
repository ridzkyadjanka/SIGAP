// SIGAP — Skema database PostgreSQL (Drizzle ORM)
import {
  pgTable,
  pgEnum,
  text,
  boolean,
  integer,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { randomUUID } from "crypto";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ───────────── Enum ─────────────
export const roleEnum = pgEnum("role", ["SUPER_ADMIN", "ADMIN_MANPOWER", "GROUP_LEADER", "OPERATOR"]);
export const categoryEnum = pgEnum("personnel_category", ["OPERATOR", "GROUP_LEADER"]);
export const glTypeEnum = pgEnum("gl_type", ["PRODUKSI", "DEWATERING", "MANPOWER", "OPD", "HAULING"]);
export const workStatusEnum = pgEnum("work_status", ["AKTIF", "SAKIT", "CUTI", "RESIGN"]);
export const unitStatusEnum = pgEnum("unit_status", ["OPERASI", "STANDBY", "BREAKDOWN"]);
export const shiftEnum = pgEnum("shift_code", ["PAGI", "MALAM"]);
export const assignmentStatusEnum = pgEnum("assignment_status", ["DRAFT", "PUBLISHED", "CHANGED"]);
export const leaveStatusEnum = pgEnum("leave_status", ["DIJADWALKAN", "BERLANGSUNG", "SELESAI", "DIBATALKAN"]);
export const deactivationReasonEnum = pgEnum("deactivation_reason", [
  "SAKIT",
  "CUTI_PERIODIK",
  "RESIGN",
  "ADMINISTRATIF",
]);

// ───────────── Personel ─────────────
export const personnel = pgTable("personnel", {
  id: id(),
  employeeNo: text("employee_no").notNull().unique(),
  name: text("name").notNull(),
  birthDate: date("birth_date").notNull(),
  category: categoryEnum("category").notNull(),
  position: text("position").notNull(),
  glType: glTypeEnum("gl_type"),
  phone: text("phone"),
  skills: text("skills").array().notNull().default([]),
  workStatus: workStatusEnum("work_status").notNull().default("AKTIF"),
  joinDate: date("join_date").notNull(),
  cycleStartDate: date("cycle_start_date").notNull(),
  pitId: text("pit_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ───────────── Akun & Sesi ─────────────
export const users = pgTable("users", {
  id: id(),
  employeeNo: text("employee_no").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  displayName: text("display_name"),
  personnelId: text("personnel_id")
    .unique()
    .references(() => personnel.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
  isArchived: boolean("is_archived").notNull().default(false),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    tokenHash: text("token_hash").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)]
);

export const accountDeactivations = pgTable(
  "account_deactivations",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: deactivationReasonEnum("reason").notNull(),
    note: text("note"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    cancelled: boolean("cancelled").notNull().default(false),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("deact_user_idx").on(t.userId)]
);

// ───────────── Lokasi, Fleet, Unit ─────────────
export const pits = pgTable("pits", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  loadingPoint: text("loading_point"),
  dumpingPoint: text("dumping_point"),
  description: text("description"),
  leaderId: text("leader_id").references(() => personnel.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const fleets = pgTable("fleets", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  loadingPoint: text("loading_point"),
  pitId: text("pit_id").references(() => pits.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const units = pgTable("units", {
  id: id(),
  code: text("code").notNull().unique(),
  category: text("category").notNull(),
  model: text("model").notNull(),
  status: unitStatusEnum("status").notNull().default("STANDBY"),
  notes: text("notes"),
  fleetId: text("fleet_id").references(() => fleets.id, { onDelete: "set null" }),
  pitId: text("pit_id").references(() => pits.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const unitMovements = pgTable("unit_movements", {
  id: id(),
  unitId: text("unit_id")
    .notNull()
    .references(() => units.id, { onDelete: "cascade" }),
  fromPit: text("from_pit"),
  toPit: text("to_pit"),
  fromFleet: text("from_fleet"),
  toFleet: text("to_fleet"),
  note: text("note"),
  movedBy: text("moved_by").notNull(),
  createdAt: createdAt(),
});

// ───────────── Shift & Roster ─────────────
export const shiftConfigs = pgTable("shift_configs", {
  code: shiftEnum("code").primaryKey(),
  name: text("name").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  breakStart: text("break_start").notNull(),
  breakEnd: text("break_end").notNull(),
  updatedAt: updatedAt(),
});

/** Perubahan jam kerja khusus pada tanggal tertentu (opsional per PIT). */
export const shiftOverrides = pgTable("shift_overrides", {
  id: id(),
  date: date("date").notNull(),
  shift: shiftEnum("shift").notNull(),
  pitId: text("pit_id").references(() => pits.id, { onDelete: "cascade" }),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  breakStart: text("break_start").notNull(),
  breakEnd: text("break_end").notNull(),
  reason: text("reason").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: createdAt(),
});

/** Perubahan roster manual per tanggal. code: P (Pagi), M (Malam), L (Libur). */
export const rosterOverrides = pgTable(
  "roster_overrides",
  {
    id: id(),
    personnelId: text("personnel_id")
      .notNull()
      .references(() => personnel.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    code: text("code").notNull(),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("roster_override_unique").on(t.personnelId, t.date)]
);

// ───────────── Cuti Periodik ─────────────
export const leaves = pgTable(
  "leave_periods",
  {
    id: id(),
    personnelId: text("personnel_id")
      .notNull()
      .references(() => personnel.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: leaveStatusEnum("status").notNull().default("DIJADWALKAN"),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("leave_person_idx").on(t.personnelId)]
);

export const replacements = pgTable("replacements", {
  id: id(),
  leaveId: text("leave_id")
    .notNull()
    .references(() => leaves.id, { onDelete: "cascade" }),
  replacementPersonnelId: text("replacement_personnel_id")
    .notNull()
    .references(() => personnel.id, { onDelete: "cascade" }),
  unitCode: text("unit_code"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  note: text("note"),
  createdBy: text("created_by").notNull(),
  createdAt: createdAt(),
});

// ───────────── Penugasan Harian ─────────────
export const assignments = pgTable(
  "assignments",
  {
    id: id(),
    date: date("date").notNull(),
    shift: shiftEnum("shift").notNull(),
    status: assignmentStatusEnum("status").notNull().default("DRAFT"),
    personnelId: text("personnel_id")
      .notNull()
      .references(() => personnel.id, { onDelete: "cascade" }),
    unitId: text("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    fleetId: text("fleet_id").references(() => fleets.id, { onDelete: "set null" }),
    pitId: text("pit_id").references(() => pits.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("assignment_person_unique").on(t.date, t.shift, t.personnelId),
    uniqueIndex("assignment_unit_unique").on(t.date, t.shift, t.unitId),
    index("assignment_date_idx").on(t.date),
  ]
);

export const assignmentHistory = pgTable(
  "assignment_history",
  {
    id: id(),
    date: date("date").notNull(),
    shift: shiftEnum("shift").notNull(),
    unitCode: text("unit_code").notNull(),
    action: text("action").notNull(),
    previousPersonnel: text("previous_personnel"),
    newPersonnel: text("new_personnel"),
    reason: text("reason"),
    changedBy: text("changed_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("assignment_history_date_idx").on(t.date)]
);

// ───────────── Notifikasi, Audit, Pengaturan ─────────────
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    key: text("key").unique(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    link: text("link"),
    forAdmin: boolean("for_admin").notNull().default(false),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("notif_admin_idx").on(t.forAdmin, t.isRead), index("notif_user_idx").on(t.userId, t.isRead)]
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorId: text("actor_id"),
    actorName: text("actor_name").notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    detail: text("detail"),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt)]
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
});

/** Riwayat publikasi tampilan landing page (untuk kembalikan tampilan sebelumnya). */
export const siteContentVersions = pgTable("site_content_versions", {
  id: id(),
  content: jsonb("content").notNull(),
  publishedBy: text("published_by").notNull(),
  createdAt: createdAt(),
});

// ───────────── Relasi ─────────────
export const personnelRelations = relations(personnel, ({ one, many }) => ({
  pit: one(pits, { fields: [personnel.pitId], references: [pits.id] }),
  user: one(users, { fields: [personnel.id], references: [users.personnelId] }),
  leaves: many(leaves),
  assignments: many(assignments),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  personnel: one(personnel, { fields: [users.personnelId], references: [personnel.id] }),
  sessions: many(sessions),
  deactivations: many(accountDeactivations),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const deactivationRelations = relations(accountDeactivations, ({ one }) => ({
  user: one(users, { fields: [accountDeactivations.userId], references: [users.id] }),
}));

export const pitsRelations = relations(pits, ({ one, many }) => ({
  leader: one(personnel, { fields: [pits.leaderId], references: [personnel.id] }),
  fleets: many(fleets),
  units: many(units),
}));

export const fleetsRelations = relations(fleets, ({ one, many }) => ({
  pit: one(pits, { fields: [fleets.pitId], references: [pits.id] }),
  units: many(units),
}));

export const unitsRelations = relations(units, ({ one, many }) => ({
  fleet: one(fleets, { fields: [units.fleetId], references: [fleets.id] }),
  pit: one(pits, { fields: [units.pitId], references: [pits.id] }),
  movements: many(unitMovements),
}));

export const unitMovementsRelations = relations(unitMovements, ({ one }) => ({
  unit: one(units, { fields: [unitMovements.unitId], references: [units.id] }),
}));

export const leavesRelations = relations(leaves, ({ one, many }) => ({
  personnel: one(personnel, { fields: [leaves.personnelId], references: [personnel.id] }),
  replacements: many(replacements),
}));

export const replacementsRelations = relations(replacements, ({ one }) => ({
  leave: one(leaves, { fields: [replacements.leaveId], references: [leaves.id] }),
  replacementPersonnel: one(personnel, {
    fields: [replacements.replacementPersonnelId],
    references: [personnel.id],
  }),
}));

export const assignmentsRelations = relations(assignments, ({ one }) => ({
  personnel: one(personnel, { fields: [assignments.personnelId], references: [personnel.id] }),
  unit: one(units, { fields: [assignments.unitId], references: [units.id] }),
  fleet: one(fleets, { fields: [assignments.fleetId], references: [fleets.id] }),
  pit: one(pits, { fields: [assignments.pitId], references: [pits.id] }),
}));

export const rosterOverridesRelations = relations(rosterOverrides, ({ one }) => ({
  personnel: one(personnel, { fields: [rosterOverrides.personnelId], references: [personnel.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export type Personnel = typeof personnel.$inferSelect;
export type User = typeof users.$inferSelect;
export type Unit = typeof units.$inferSelect;
export type Pit = typeof pits.$inferSelect;
export type Fleet = typeof fleets.$inferSelect;
export type LeavePeriod = typeof leaves.$inferSelect;
export type ShiftCode = (typeof shiftEnum.enumValues)[number];
export type Role = (typeof roleEnum.enumValues)[number];
