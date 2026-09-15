import { pgTable, serial, text, integer, timestamp, pgEnum, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectStatusEnum = pgEnum("project_status", [
  "pending",
  "analyzing",
  "analyzed",
  "ready_for_market",
]);

export const analysisModeEnum = pgEnum("analysis_mode", ["blind", "documented"]);
export const projectClassificationEnum = pgEnum("project_classification", [
  "sell",
  "hold",
  "develop",
  "unreviewed",
]);

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  repoUrl: text("repo_url"),
  githubOwner: text("github_owner"),
  githubRepository: text("github_repository"),
  aliases: text("aliases").array().notNull().default([]),
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
  valueOverride: integer("value_override"),
  readinessOverride: integer("readiness_override"),
  classification: projectClassificationEnum("classification").notNull().default("unreviewed"),
  classificationOverride: projectClassificationEnum("classification_override"),
  latestCommitSha: text("latest_commit_sha"),
  analyzedCommitSha: text("analyzed_commit_sha"),
  lastAnalyzedAt: timestamp("last_analyzed_at"),
  analysisError: text("analysis_error"),
  liveProductVerified: boolean("live_product_verified").notNull().default(false),
  saleReadiness: jsonb("sale_readiness"),
  valuationBasis: text("valuation_basis"),
  flippaPackage: jsonb("flippa_package"),
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
