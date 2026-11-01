import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetUsername: text("target_username").notNull(),
    message: text("message").notNull(),
    sendTime: text("send_time").notNull(),
    timezone: text("timezone").notNull().default("Africa/Cairo"),
    jitterMinutes: integer("jitter_minutes").notNull().default(5),
    enabled: boolean("enabled").notNull().default(true),
    lastRunDate: date("last_run_date"),
    lastStatus: text("last_status"),
    retryCount: integer("retry_count").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    enabledIdx: index("jobs_enabled_idx").on(table.enabled),
  }),
);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  cookiesEncrypted: text("cookies_encrypted").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  source: text("source").notNull().default("manual"),
});

export const logs = pgTable(
  "logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    detail: text("detail"),
    screenshotUrl: text("screenshot_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    jobIdIdx: index("logs_job_id_idx").on(table.jobId),
    createdAtIdx: index("logs_created_at_idx").on(table.createdAt),
  }),
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Log = typeof logs.$inferSelect;
export type NewLog = typeof logs.$inferInsert;
