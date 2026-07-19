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
import { parseGitHubUrl, fetchRepoSnapshot } from "../services/github.js";
import { runFullCouncil } from "../services/council.js";

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

// Trigger analysis — responds immediately, runs council in background
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

  if (!project.repoUrl) {
    res.status(422).json({ error: "Project has no GitHub URL. Add a repo URL before analyzing." });
    return;
  }

  const githubCoords = parseGitHubUrl(project.repoUrl);
  if (!githubCoords) {
    res.status(422).json({ error: "Could not parse GitHub URL. Expected format: https://github.com/owner/repo" });
    return;
  }

  // Create tracking task + set project to analyzing
  const [task] = await db
    .insert(tasksTable)
    .values({
      title: `AI Council Analysis: ${project.name}`,
      description: `Full 5-member AI Council analysis of ${githubCoords.owner}/${githubCoords.repo}`,
      status: "queued",
      projectId: project.id,
    })
    .returning();

  await db
    .update(projectsTable)
    .set({ status: "analyzing", updatedAt: new Date() })
    .where(eq(projectsTable.id, project.id));

  await db.insert(auditLogsTable).values({
    projectId: project.id,
    action: "AI Council analysis triggered",
    reason: `User requested ${project.analysisMode} analysis`,
    agent: "system",
    approvalStatus: "approved",
  });

  // Respond immediately — analysis runs in background
  res.status(202).json({ taskId: task.id, message: "Analysis queued. Council is convening." });

  // ── Background work ──────────────────────────────────────────────────────
  const blind = project.analysisMode === "blind";

  (async () => {
    try {
      // Mark task running
      await db
        .update(tasksTable)
        .set({ status: "running" })
        .where(eq(tasksTable.id, task.id));

      // Fetch real GitHub data
      const snapshot = await fetchRepoSnapshot(githubCoords.owner, githubCoords.repo);

      // Run full AI Council
      const { findings, verdict } = await runFullCouncil(snapshot, blind);

      // Persist council findings (one row per role)
      for (const finding of findings) {
        await db.insert(analysesTable).values({
          projectId: project.id,
          role: finding.role,
          content: finding.content,
          confidenceLevel: finding.confidenceLevel,
          governorStatus: "pending",
        });
      }

      // Persist governor verdict as its own analysis row
      await db.insert(analysesTable).values({
        projectId: project.id,
        role: "governor",
        content: verdict.content,
        confidenceLevel: verdict.confidenceLevel,
        governorStatus: "approved",
        governorNote: "Governor self-verified",
      });

      // Update project with scores and inferred data
      await db
        .update(projectsTable)
        .set({
          status: "analyzed",
          valueScore: verdict.valueScore,
          readinessScore: verdict.readinessScore,
          opportunityScore: verdict.opportunityScore,
          estimatedMarketValue: verdict.estimatedMarketValue,
          estimatedBuildCost: verdict.estimatedBuildCost,
          tags: verdict.tags.length > 0 ? verdict.tags : project.tags,
          inferredDescription: verdict.inferredDescription || null,
          primaryLanguage: verdict.primaryLanguage || snapshot.metadata.language || null,
          description: project.description ?? (snapshot.metadata.description || null),
          updatedAt: new Date(),
        })
        .where(eq(projectsTable.id, project.id));

      // Mark task complete
      await db
        .update(tasksTable)
        .set({
          status: "completed",
          result: `Council complete. Value: ${verdict.valueScore}/100 · Readiness: ${verdict.readinessScore}/100 · Opportunity: ${verdict.opportunityScore}/100. Estimated market value: ${verdict.estimatedMarketValue.toLocaleString()}.`,
          completedAt: new Date(),
        })
        .where(eq(tasksTable.id, task.id));

      // Audit trail
      await db.insert(auditLogsTable).values({
        projectId: project.id,
        action: "AI Council analysis complete",
        before: "status: analyzing",
        after: `status: analyzed | value: ${verdict.valueScore} | readiness: ${verdict.readinessScore} | opportunity: ${verdict.opportunityScore}`,
        reason: "All council members reported. Governor synthesized findings.",
        agent: "governor",
        approvalStatus: "pending",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[council] Analysis failed for project ${project.id}:`, err);

      // Determine user-friendly reason
      const isQuota = msg.includes("quota") || msg.includes("billing") || msg.includes("insufficient") || msg.includes("credit") || msg.includes("429") || msg.includes("rate limit");
      const isEmptyRepo = msg.includes("empty") || msg.includes("409") || msg.includes("Git Repository is empty");
      const friendlyMsg = isQuota
        ? "OpenAI credit balance is too low to run analysis. Please add credits at platform.openai.com and try again."
        : isEmptyRepo
        ? "This repository appears to be empty — no code or commits were found. Add some code and try again."
        : `Analysis failed: ${msg}`;

      // Store the error as a governor finding so the UI can show it
      await db.insert(analysesTable).values({
        projectId: project.id,
        role: "governor",
        content: `⚠️ ${friendlyMsg}`,
        confidenceLevel: "unknown",
        governorStatus: "pending",
      });

      await db
        .update(tasksTable)
        .set({ status: "failed", result: friendlyMsg })
        .where(eq(tasksTable.id, task.id));

      await db
        .update(projectsTable)
        .set({ status: "pending", updatedAt: new Date() })
        .where(eq(projectsTable.id, project.id));
    }
  })();
});

// Chat with Kee about a specific project
router.post("/projects/:id/chat", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }

  const { message, history = [] } = req.body as {
    message: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const analyses = await db
    .select()
    .from(analysesTable)
    .where(eq(analysesTable.projectId, id))
    .orderBy(desc(analysesTable.createdAt));

  const governor = analyses.find(a => a.role === "governor" && !a.content.startsWith("⚠️"));
  const codeAudit = analyses.find(a => a.role === "researcher");
  const market = analyses.find(a => a.role === "market_evaluator");

  const projectContext = `
PROJECT: ${project.name}
${project.inferredDescription ? `Description: ${project.inferredDescription}` : ""}
${project.primaryLanguage ? `Primary language: ${project.primaryLanguage}` : ""}
${project.tags?.length ? `Tags: ${project.tags.join(", ")}` : ""}
${project.valueScore != null ? `Scores — Value: ${project.valueScore}/100, Readiness: ${project.readinessScore}/100, Opportunity: ${project.opportunityScore}/100` : ""}
${project.estimatedMarketValue ? `Estimated market value: ${project.estimatedMarketValue.toLocaleString()}` : ""}

${governor ? `KEE'S SUMMARY:\n${governor.content.slice(0, 1500)}` : ""}
${codeAudit ? `\nCODE AUDIT (excerpt):\n${codeAudit.content.slice(0, 800)}` : ""}
${market ? `\nMARKET ANALYSIS (excerpt):\n${market.content.slice(0, 800)}` : ""}
  `.trim();

  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 800,
    messages: [
      {
        role: "system",
        content: `You are Kee — Loretta's private cognitive partner for evaluating software assets. You are direct, sharp, and genuinely helpful. You speak to Loretta as an equal and a trusted advisor, not a chatbot. You have analyzed this project and know it well.

When Loretta asks about code, valuation, who to sell to, what to fix, or anything about this project — answer decisively from your analysis. Do not hedge unnecessarily. Keep responses concise: 2-4 paragraphs max unless she asks for more detail.

PROJECT CONTEXT:
${projectContext}`,
      },
      ...history.slice(-8), // keep last 8 turns for context
      { role: "user", content: message },
    ],
  });

  const reply = completion.choices[0]?.message?.content ?? "I'm not sure — try rephrasing?";
  res.json({ reply });
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
