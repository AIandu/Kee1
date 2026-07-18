import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, tasksTable } from "@workspace/db";
import {
  ListTasksQueryParams,
  CreateTaskBody,
  ApproveTaskParams,
  ApproveTaskBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

// List tasks
router.get("/tasks", async (req, res): Promise<void> => {
  const query = ListTasksQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  let dbQuery = db.select().from(tasksTable).$dynamic();

  if (query.data.status) {
    dbQuery = dbQuery.where(
      eq(tasksTable.status, query.data.status as "queued" | "running" | "completed" | "failed" | "awaiting_approval"),
    );
  }

  const tasks = await dbQuery.orderBy(desc(tasksTable.createdAt));
  res.json(tasks);
});

// Create task
router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [task] = await db
    .insert(tasksTable)
    .values({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      projectId: parsed.data.projectId ?? null,
      status: "queued",
    })
    .returning();
  res.status(201).json(task);
});

// Approve/reject task
router.post("/tasks/:id/approve", async (req, res): Promise<void> => {
  const params = ApproveTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = ApproveTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const newStatus = parsed.data.approved ? "queued" : "failed";
  const [task] = await db
    .update(tasksTable)
    .set({ status: newStatus })
    .where(eq(tasksTable.id, params.data.id))
    .returning();

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json(task);
});

export default router;
