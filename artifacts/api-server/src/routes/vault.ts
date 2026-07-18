import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, vaultEntriesTable, type InsertVaultEntry } from "@workspace/db";
import {
  CreateVaultEntryBody,
  UpdateVaultEntryBody,
  GetVaultEntryParams,
  UpdateVaultEntryParams,
  DeleteVaultEntryParams,
  ListVaultEntriesQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// List vault entries
router.get("/vault", async (req, res): Promise<void> => {
  const query = ListVaultEntriesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  let dbQuery = db.select().from(vaultEntriesTable).$dynamic();

  if (query.data.projectId != null) {
    dbQuery = dbQuery.where(eq(vaultEntriesTable.linkedProjectId, query.data.projectId));
  }

  const entries = await dbQuery.orderBy(desc(vaultEntriesTable.updatedAt));

  // Filter by tag in memory if needed (since tags is an array column)
  const tag = query.data.tag;
  if (tag) {
    res.json(entries.filter((e) => e.tags.includes(tag)));
    return;
  }

  res.json(entries);
});

// Create vault entry
router.post("/vault", async (req, res): Promise<void> => {
  const parsed = CreateVaultEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [entry] = await db
    .insert(vaultEntriesTable)
    .values({
      title: parsed.data.title,
      content: parsed.data.content,
      entryType: (parsed.data.entryType as "note" | "document" | "conversation" | "idea" | "decision") ?? "note",
      tags: parsed.data.tags ?? [],
      linkedProjectId: parsed.data.linkedProjectId ?? null,
    })
    .returning();
  res.status(201).json(entry);
});

// Get vault entry by id
router.get("/vault/:id", async (req, res): Promise<void> => {
  const params = GetVaultEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [entry] = await db
    .select()
    .from(vaultEntriesTable)
    .where(eq(vaultEntriesTable.id, params.data.id));
  if (!entry) {
    res.status(404).json({ error: "Vault entry not found" });
    return;
  }
  res.json(entry);
});

// Update vault entry
router.patch("/vault/:id", async (req, res): Promise<void> => {
  const params = UpdateVaultEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateVaultEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Partial<InsertVaultEntry> & { updatedAt?: Date } = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
  if (parsed.data.content !== undefined) updateData.content = parsed.data.content;
  if (parsed.data.entryType !== undefined) updateData.entryType = parsed.data.entryType as InsertVaultEntry["entryType"];
  if (parsed.data.tags !== undefined) updateData.tags = parsed.data.tags;
  if (parsed.data.linkedProjectId !== undefined) updateData.linkedProjectId = parsed.data.linkedProjectId;

  const [entry] = await db
    .update(vaultEntriesTable)
    .set(updateData)
    .where(eq(vaultEntriesTable.id, params.data.id))
    .returning();
  if (!entry) {
    res.status(404).json({ error: "Vault entry not found" });
    return;
  }
  res.json(entry);
});

// Delete vault entry
router.delete("/vault/:id", async (req, res): Promise<void> => {
  const params = DeleteVaultEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [entry] = await db
    .delete(vaultEntriesTable)
    .where(eq(vaultEntriesTable.id, params.data.id))
    .returning();
  if (!entry) {
    res.status(404).json({ error: "Vault entry not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
