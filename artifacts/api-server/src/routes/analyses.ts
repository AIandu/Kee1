import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, analysesTable, auditLogsTable } from "@workspace/db";
import { ApproveAnalysisParams, ApproveAnalysisBody } from "@workspace/api-zod";

const router: IRouter = Router();

// Governor approve/reject analysis
router.post("/analyses/:id/approve", async (req, res): Promise<void> => {
  const params = ApproveAnalysisParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = ApproveAnalysisBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(analysesTable)
    .where(eq(analysesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }

  const [analysis] = await db
    .update(analysesTable)
    .set({
      governorStatus: parsed.data.status as "approved" | "rejected",
      governorNote: parsed.data.note ?? null,
    })
    .where(eq(analysesTable.id, params.data.id))
    .returning();

  // Audit log
  await db.insert(auditLogsTable).values({
    projectId: existing.projectId,
    action: `Analysis finding ${parsed.data.status}`,
    before: `governor_status: pending`,
    after: `governor_status: ${parsed.data.status}`,
    reason: parsed.data.note ?? `Governor verdict: ${parsed.data.status}`,
    agent: "governor",
    approvalStatus: "approved",
  });

  res.json(analysis);
});

export default router;
