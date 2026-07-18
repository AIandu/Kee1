import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectStatusEnum = pgEnum("project_status", [
  "pending",
  "analyzing",
  "analyzed",
  "ready_for_market",
]);

export const analysisModeEnum = pgEnum("analysis_mode", ["blind", "documented"]);

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  repoUrl: text("repo_url"),
  description: text("description"),
  inferredDescription: text("inferred_description"),
  primaryLanguage: text("primary_language"),
  status: projectStatusEnum("status").notNull().default("pending"),
  analysisMode: analysisModeEnum("analysis_mode").notNull().default("blind"),
  valueScore: integer("value_score"),
  readinessScore: integer("readiness_score"),
  opportunityScore: integer("opportunity_score"),
  estimatedBuildCost: integer("estimated_build_cost"),
  estimatedMarketValue: integer("estimated_market_value"),
  tags: text("tags").array().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
