import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const entryTypeEnum = pgEnum("entry_type", [
  "note",
  "document",
  "conversation",
  "idea",
  "decision",
]);

export const vaultEntriesTable = pgTable("vault_entries", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  entryType: entryTypeEnum("entry_type").notNull().default("note"),
  tags: text("tags").array().notNull().default([]),
  linkedProjectId: integer("linked_project_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVaultEntrySchema = createInsertSchema(vaultEntriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVaultEntry = z.infer<typeof insertVaultEntrySchema>;
export type VaultEntry = typeof vaultEntriesTable.$inferSelect;
