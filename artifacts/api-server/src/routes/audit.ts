import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, auditLogsTable } from "@workspace/db";
import {
  ListAuditLogsQueryParams,
  ApproveAuditLogParams,
  ApproveAuditLogBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

// List audit logs
router.get("/audit", async (req, res): Promise<void> => {
  const query = ListAuditLogsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [];
  if (query.data.projectId != null) {
    conditions.push(eq(auditLogsTable.projectId, query.data.projectId));
  }
  if (query.data.approvalStatus) {
    conditions.push(
      eq(
        auditLogsTable.approvalStatus,
        query.data.approvalStatus as "pending" | "approved" | "rejected",
      ),
    );
  }

  const logs =
    conditions.length > 0
      ? await db
          .select()
          .from(auditLogsTable)
          .where(and(...conditions))
          .orderBy(desc(auditLogsTable.createdAt))
      : await db
          .select()
          .from(auditLogsTable)
          .orderBy(desc(auditLogsTable.createdAt));

  res.json(logs);
});

// Approve/reject audit log
router.post("/audit/:id/approve", async (req, res): Promise<void> => {
  const params = ApproveAuditLogParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = ApproveAuditLogBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [log] = await db
    .update(auditLogsTable)
    .set({ approvalStatus: parsed.data.status as "approved" | "rejected" })
    .where(eq(auditLogsTable.id, params.data.id))
    .returning();

  if (!log) {
    res.status(404).json({ error: "Audit log not found" });
    return;
  }
  res.json(log);
});

export default router;
