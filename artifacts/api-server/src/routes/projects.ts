import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, projectsTable, analysesTable, tasksTable, auditLogsTable, type InsertProject } from "@workspace/db";
import {
  CreateProjectBody,
  UpdateProjectBody,
  GetProjectParams,
  UpdateProjectParams,
  DeleteProjectParams,
  AnalyzeProjectParams,
  AnalyzeProjectBody,
  GetProjectAnalysesParams,
  GetProjectRelationshipsParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// List all projects ordered by value score descending
router.get("/projects", async (_req, res): Promise<void> => {
  const projects = await db
    .select()
    .from(projectsTable)
    .orderBy(desc(sql`coalesce(${projectsTable.valueScore}, 0)`));
  res.json(projects);
});

// Create project
router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [project] = await db
    .insert(projectsTable)
    .values({
      name: parsed.data.name,
      repoUrl: parsed.data.repoUrl ?? null,
      description: parsed.data.description ?? null,
      analysisMode: (parsed.data.analysisMode as "blind" | "documented") ?? "blind",
      tags: parsed.data.tags ?? [],
    })
    .returning();

  // Audit log
  await db.insert(auditLogsTable).values({
    projectId: project.id,
    action: "Project created",
    reason: "User added project to Kee",
    agent: "system",
    approvalStatus: "approved",
  });

  res.status(201).json(project);
});

// Get project by id
router.get("/projects/:id", async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.id));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(project);
});

// Update project
router.patch("/projects/:id", async (req, res): Promise<void> => {
  const params = UpdateProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Partial<InsertProject> & { updatedAt?: Date } = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.repoUrl !== undefined) updateData.repoUrl = parsed.data.repoUrl;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status as InsertProject["status"];
  if (parsed.data.valueScore !== undefined) updateData.valueScore = parsed.data.valueScore;
  if (parsed.data.readinessScore !== undefined) updateData.readinessScore = parsed.data.readinessScore;
  if (parsed.data.opportunityScore !== undefined) updateData.opportunityScore = parsed.data.opportunityScore;
  if (parsed.data.estimatedBuildCost !== undefined) updateData.estimatedBuildCost = parsed.data.estimatedBuildCost;
  if (parsed.data.estimatedMarketValue !== undefined) updateData.estimatedMarketValue = parsed.data.estimatedMarketValue;
  if (parsed.data.tags !== undefined) updateData.tags = parsed.data.tags;

  const [project] = await db
    .update(projectsTable)
    .set(updateData)
    .where(eq(projectsTable.id, params.data.id))
    .returning();
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(project);
});

// Delete project
router.delete("/projects/:id", async (req, res): Promise<void> => {
  const params = DeleteProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [project] = await db
    .delete(projectsTable)
    .where(eq(projectsTable.id, params.data.id))
    .returning();
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.sendStatus(204);
});

// Trigger analysis
router.post("/projects/:id/analyze", async (req, res): Promise<void> => {
  const params = AnalyzeProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = AnalyzeProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.id));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  // Create a task for the analysis
  const [task] = await db
    .insert(tasksTable)
    .values({
      title: `AI Council Analysis: ${project.name}`,
      description: `Full AI Council analysis of project ${project.name}`,
      status: "queued",
      projectId: project.id,
    })
    .returning();

  // Mark project as analyzing
  await db
    .update(projectsTable)
    .set({ status: "analyzing", updatedAt: new Date() })
    .where(eq(projectsTable.id, project.id));

  // Audit log
  await db.insert(auditLogsTable).values({
    projectId: project.id,
    action: "Analysis triggered",
    reason: "User requested AI Council analysis",
    agent: "system",
    approvalStatus: "approved",
  });

  res.status(202).json(task);
});

// Get project analyses
router.get("/projects/:id/analyses", async (req, res): Promise<void> => {
  const params = GetProjectAnalysesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const analyses = await db
    .select()
    .from(analysesTable)
    .where(eq(analysesTable.projectId, params.data.id))
    .orderBy(desc(analysesTable.createdAt));
  res.json(analyses);
});

// Get project relationships (stub — returns empty for now)
router.get("/projects/:id/relationships", async (req, res): Promise<void> => {
  const params = GetProjectRelationshipsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  res.json({ projectId: params.data.id, relationships: [] });
});

export default router;
