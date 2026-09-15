import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const councilRoleEnum = pgEnum("council_role", [
  "researcher",
  "engineering_reviewer",
  "product_analyst",
  "documentation_specialist",
  "market_evaluator",
  "governor",
]);

export const confidenceLevelEnum = pgEnum("confidence_level", [
  "confirmed",
  "inferred",
  "unknown",
]);

export const governorStatusEnum = pgEnum("governor_status", [
  "pending",
  "approved",
  "rejected",
]);

export const analysesTable = pgTable("analyses", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  role: councilRoleEnum("role").notNull(),
  content: text("content").notNull(),
  commitSha: text("commit_sha"),
  confidenceLevel: confidenceLevelEnum("confidence_level").notNull().default("inferred"),
  governorStatus: governorStatusEnum("governor_status").notNull().default("pending"),
  governorNote: text("governor_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAnalysisSchema = createInsertSchema(analysesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertAnalysis = z.infer<typeof insertAnalysisSchema>;
export type Analysis = typeof analysesTable.$inferSelect;
