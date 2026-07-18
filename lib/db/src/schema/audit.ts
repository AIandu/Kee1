import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
]);

export const auditAgentEnum = pgEnum("audit_agent", [
  "researcher",
  "engineering_reviewer",
  "product_analyst",
  "documentation_specialist",
  "market_evaluator",
  "governor",
  "system",
]);

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id"),
  action: text("action").notNull(),
  before: text("before"),
  after: text("after"),
  reason: text("reason").notNull().default(""),
  agent: auditAgentEnum("agent").notNull().default("system"),
  approvalStatus: approvalStatusEnum("approval_status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogsTable.$inferSelect;
