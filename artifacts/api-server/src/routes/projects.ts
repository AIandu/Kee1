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
import { parseGitHubUrl, fetchRepoSnapshot, buildSaleReadiness } from "../services/github.js";
import { runFullCouncil, InsufficientRepositoryDataError } from "../services/council.js";
import { getOpenAI, OPENAI_MODEL } from "../services/openai.js";

const router: IRouter = Router();

function effectiveClassification(project: { classification: string; classificationOverride: string | null }) {
  return project.classificationOverride ?? project.classification;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// List all projects ordered by effective value score descending.
router.get("/projects", async (req, res): Promise<void> => {
  const projects = await db
    .select()
    .from(projectsTable)
    .orderBy(desc(sql`coalesce(${projectsTable.valueScore}, 0)`));
  const q = String(req.query.q ?? "").trim().toLowerCase();
  const owner = String(req.query.owner ?? "").trim().toLowerCase();
  const classification = String(req.query.classification ?? "").trim().toLowerCase();
  const status = String(req.query.status ?? "").trim().toLowerCase();
  const minReadiness = Number(req.query.minReadiness ?? "");

  const filtered = projects.filter((project) => {
    const searchable = [project.name, project.repoUrl, project.githubOwner, project.githubRepository, project.description]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const readiness = project.readinessOverride ?? project.readinessScore ?? 0;
    return (
      (!q || searchable.includes(q)) &&
      (!owner || (project.githubOwner ?? "").toLowerCase().includes(owner)) &&
      (!classification || effectiveClassification(project) === classification) &&
      (!status || project.status === status) &&
      (!Number.isFinite(minReadiness) || readiness >= minReadiness)
    );
  });

  const possibleDuplicates = new Map<number, number[]>();
  for (const project of projects) {
    const matches = projects
      .filter((other) => {
        if (other.id === project.id) return false;
        const sameRepo = normalize(other.githubRepository) && normalize(other.githubRepository) === normalize(project.githubRepository);
        const sameName = normalize(other.name) && normalize(other.name) === normalize(project.name);
        const sameAlias = (other.aliases ?? []).some((alias) =>
          (project.aliases ?? []).some((ownAlias) => normalize(alias) === normalize(ownAlias))
        );
        return Boolean(sameRepo || sameName || sameAlias);
      })
      .map((other) => other.id);
    possibleDuplicates.set(project.id, matches);
  }

  res.json(filtered.map((project) => ({
    ...project,
    effectiveValue: project.valueOverride ?? project.estimatedMarketValue ?? project.valueScore,
    effectiveReadiness: project.readinessOverride ?? project.readinessScore,
    effectiveClassification: effectiveClassification(project),
    possibleDuplicateIds: possibleDuplicates.get(project.id) ?? [],
  })));
});

function csvCell(value: unknown): string {
  const text = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

router.get("/projects/export", async (req, res): Promise<void> => {
  const projects = await db.select().from(projectsTable).orderBy(desc(projectsTable.updatedAt));
  const analyses = await db.select().from(analysesTable).orderBy(desc(analysesTable.createdAt));
  const analysesByProject = new Map<number, typeof analyses>();
  for (const analysis of analyses) {
    const list = analysesByProject.get(analysis.projectId) ?? [];
    list.push(analysis);
    analysesByProject.set(analysis.projectId, list);
  }
  const rows = projects.map((project) => {
    const evidence = (analysesByProject.get(project.id) ?? [])
      .filter((analysis) => analysis.role === "governor" || analysis.role === "researcher")
      .map((analysis) => analysis.content)
      .join("\n")
      .slice(0, 4000);
    return {
      project: project.name,
      owner: project.githubOwner,
      repository: project.githubRepository,
      sha: project.analyzedCommitSha ?? project.latestCommitSha,
      classification: effectiveClassification(project),
      score: project.valueScore,
      value: project.valueOverride ?? project.estimatedMarketValue,
      readiness: project.readinessOverride ?? project.readinessScore,
      opportunity: project.opportunityScore,
      evidence,
      issue: project.analysisError,
      checklist: project.saleReadiness,
      liveProductVerified: project.liveProductVerified,
      analyses: analysesByProject.get(project.id) ?? [],
    };
  });

  const format = String(req.query.format ?? "json").toLowerCase();
  if (format === "csv") {
    const headers = [
      "project", "owner", "repository", "sha", "classification", "score", "value",
      "readiness", "opportunity", "evidence", "issue", "checklist_readme",
      "checklist_license", "checklist_build", "checklist_tests", "checklist_deployment",
      "checklist_env_docs", "checklist_secret_risk", "checklist_placeholders",
      "checklist_required_before_sale", "live_product_verified",
    ];
    const csvRows = rows.map((row) => {
      const checklist = (row.checklist ?? {}) as Record<string, unknown>;
      return [
        row.project, row.owner, row.repository, row.sha, row.classification, row.score,
        row.value, row.readiness, row.opportunity, row.evidence, row.issue,
        (checklist.readme as { status?: string } | undefined)?.status,
        (checklist.license as { status?: string } | undefined)?.status,
        (checklist.buildConfiguration as { status?: string } | undefined)?.status,
        (checklist.tests as { status?: string } | undefined)?.status,
        (checklist.deploymentInstructions as { status?: string } | undefined)?.status,
        (checklist.environmentVariableDocumentation as { status?: string } | undefined)?.status,
        (checklist.exposedSecretRisk as { status?: string } | undefined)?.status,
        (checklist.placeholderOrDemoData as { status?: string } | undefined)?.status,
        checklist.requiredBeforeSale,
        row.liveProductVerified,
      ].map(csvCell).join(",");
    });
    res.type("text/csv").attachment("kee-portfolio.csv").send([headers.map(csvCell).join(","), ...csvRows].join("\n"));
    return;
  }
  res.json(rows);
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
      githubOwner: parsed.data.repoUrl ? parseGitHubUrl(parsed.data.repoUrl)?.owner ?? null : null,
      githubRepository: parsed.data.repoUrl ? parseGitHubUrl(parsed.data.repoUrl)?.repo ?? null : null,
      aliases: [
        parsed.data.name,
        ...(parsed.data.repoUrl && parseGitHubUrl(parsed.data.repoUrl)?.repo
          ? [parseGitHubUrl(parsed.data.repoUrl)!.repo]
          : []),
      ],
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
router.get("/projects/:id/repository-status", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!project.repoUrl) {
    res.json({ changed: false, latestCommitSha: null, analyzedCommitSha: project.analyzedCommitSha });
    return;
  }
  const coords = parseGitHubUrl(project.repoUrl);
  if (!coords) {
    res.status(422).json({ error: "Could not parse GitHub URL." });
    return;
  }
  try {
    const snapshot = await fetchRepoSnapshot(coords.owner, coords.repo);
    await db.update(projectsTable)
      .set({ latestCommitSha: snapshot.metadata.latestCommitSha, updatedAt: new Date() })
      .where(eq(projectsTable.id, id));
    const changed = Boolean(
      project.analyzedCommitSha &&
      snapshot.metadata.latestCommitSha &&
      project.analyzedCommitSha !== snapshot.metadata.latestCommitSha
    );
    res.json({
      changed,
      latestCommitSha: snapshot.metadata.latestCommitSha,
      analyzedCommitSha: project.analyzedCommitSha,
      message: changed ? "Repository changed—reanalyze?" : "Repository unchanged.",
    });
  } catch {
    res.status(422).json({ error: "Insufficient repository data." });
  }
});

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
  if (project.status === "analyzing") {
    res.status(409).json({ error: "An analysis is already running for this project." });
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
  if (parsed.data.valueOverride !== undefined) updateData.valueOverride = parsed.data.valueOverride;
  if (parsed.data.readinessOverride !== undefined) updateData.readinessOverride = parsed.data.readinessOverride;
  if (parsed.data.classificationOverride !== undefined) updateData.classificationOverride = parsed.data.classificationOverride as InsertProject["classificationOverride"];
  if (parsed.data.liveProductVerified !== undefined) updateData.liveProductVerified = parsed.data.liveProductVerified;
  if (parsed.data.tags !== undefined) updateData.tags = parsed.data.tags;

  if (parsed.data.repoUrl !== undefined) {
    const coords = parsed.data.repoUrl ? parseGitHubUrl(parsed.data.repoUrl) : null;
    updateData.githubOwner = coords?.owner ?? null;
    updateData.githubRepository = coords?.repo ?? null;
    updateData.aliases = [
      parsed.data.name ?? "",
      ...(coords?.repo ? [coords.repo] : []),
    ].filter(Boolean);
  }

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

  const force = parsed.data.force === true;
  let snapshot: Awaited<ReturnType<typeof fetchRepoSnapshot>>;
  try {
    snapshot = await fetchRepoSnapshot(githubCoords.owner, githubCoords.repo);
  } catch (error) {
    console.error(`[github] Unable to fetch ${githubCoords.owner}/${githubCoords.repo}:`, error);
    res.status(422).json({ error: "Insufficient repository data." });
    return;
  }

  if (!force && project.analyzedCommitSha) {
    if (snapshot.metadata.latestCommitSha === project.analyzedCommitSha) {
      await db.update(projectsTable)
        .set({ latestCommitSha: snapshot.metadata.latestCommitSha, updatedAt: new Date() })
        .where(eq(projectsTable.id, project.id));
      res.status(200).json({
        skipped: true,
        message: "Repository unchanged. Existing analysis is current.",
        analyzedCommitSha: project.analyzedCommitSha,
      });
      return;
    }
    res.status(409).json({
      code: "REPOSITORY_CHANGED",
      error: "Repository changed—reanalyze?",
      latestCommitSha: snapshot.metadata.latestCommitSha,
      analyzedCommitSha: project.analyzedCommitSha,
    });
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
    .set({
      status: "analyzing",
      latestCommitSha: snapshot.metadata.latestCommitSha,
      analysisError: null,
      updatedAt: new Date(),
    })
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

      // Run full AI Council
      const { findings, verdict } = await runFullCouncil(snapshot, blind);
       const saleReadiness = buildSaleReadiness(snapshot);

      // Persist council findings (one row per role)
      for (const finding of findings) {
        await db.insert(analysesTable).values({
          projectId: project.id,
          role: finding.role,
          content: finding.content,
          commitSha: snapshot.metadata.latestCommitSha,
          confidenceLevel: finding.confidenceLevel,
          governorStatus: "pending",
        });
      }

      // Persist governor verdict as its own analysis row
      await db.insert(analysesTable).values({
        projectId: project.id,
        role: "governor",
        content: verdict.content,
        commitSha: snapshot.metadata.latestCommitSha,
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
          classification: verdict.classification,
          analyzedCommitSha: snapshot.metadata.latestCommitSha,
          lastAnalyzedAt: new Date(),
          saleReadiness,
          valuationBasis: verdict.valuationBasis || null,
          analysisError: null,
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
      const errorDetails = typeof err === "object" && err !== null
        ? err as { status?: number; code?: string }
        : {};
      const status = errorDetails.status;
      const code = errorDetails.code?.toLowerCase();
      console.error(`[council] Analysis failed for project ${project.id}:`, err);

      // Determine user-friendly reason
      const isEmptyRepo = msg.includes("empty") || msg.includes("409") || msg.includes("Git Repository is empty");
      const isInsufficient = err instanceof InsufficientRepositoryDataError || msg === "Insufficient repository data.";
      const isAuthFailure = status === 401 || code === "invalid_api_key" || msg.toLowerCase().includes("incorrect api key");
      const isTokenRateLimit = !isInsufficient && (
        code === "rate_limit_exceeded" ||
        msg.toLowerCase().includes("tokens per min") ||
        msg.toLowerCase().includes("rate limit")
      );
      const isQuota = !isInsufficient && !isTokenRateLimit && (
        code === "insufficient_quota" ||
        msg.toLowerCase().includes("quota") ||
        msg.toLowerCase().includes("billing") ||
        msg.toLowerCase().includes("credit") ||
        status === 429
      );
      const friendlyMsg = isInsufficient
        ? "Insufficient repository data."
        : isAuthFailure
        ? "OpenAI rejected the configured API key. Confirm the current OPENAI_API_KEY secret and restart the API workflow."
        : isTokenRateLimit
        ? "OpenAI token rate limit reached, not an exhausted credit balance. Please wait and try again."
        : isQuota
        ? "OpenAI reported insufficient quota for this key. Confirm the key's billing/project access and try again."
        : isEmptyRepo
        ? "This repository appears to be empty — no code or commits were found. Add some code and try again."
        : `Analysis failed: ${msg}`;

      // Store the error as a governor finding so the UI can show it
      await db.insert(analysesTable).values({
        projectId: project.id,
        role: "governor",
         content: isInsufficient ? "Insufficient repository data." : `⚠️ ${friendlyMsg}`,
        confidenceLevel: "unknown",
        governorStatus: "pending",
         commitSha: snapshot.metadata.latestCommitSha,
      });

      await db
        .update(tasksTable)
        .set({ status: "failed", result: friendlyMsg })
        .where(eq(tasksTable.id, task.id));

      await db
        .update(projectsTable)
        .set({ status: "pending", analysisError: friendlyMsg, updatedAt: new Date() })
        .where(eq(projectsTable.id, project.id));
    }
  })();
});

router.post("/projects/:id/flippa-package", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (effectiveClassification(project) !== "sell") {
    res.status(422).json({ error: "Flippa packages can only be generated for SELL projects." });
    return;
  }
  const analyses = await db.select().from(analysesTable)
    .where(eq(analysesTable.projectId, id))
    .orderBy(desc(analysesTable.createdAt));
  const evidence = analyses.map((analysis) => `=== ${analysis.role} ===\n${analysis.content}`).join("\n\n");
  if (!evidence || evidence.includes("Insufficient repository data.")) {
    res.status(422).json({ error: "Insufficient repository data." });
    return;
  }

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    max_completion_tokens: 1600,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Create a factual Flippa listing package from the supplied repository analysis only.
Every technical or product claim must cite an exact repository file path in square brackets.
Separate VERIFIED facts, INFERENCES, and UNKNOWN items.
Do not claim users, revenue, traffic, deployment, uptime, integrations, or live functionality.
Do not invent competitors, metrics, or buyer demand. Values are estimates, not appraisals.
Return JSON with keys: title, shortDescription, listingDescription, highlights (array), whatBuyerGets (array),
knownRisks (array), evidence (array), unknowns (array), disclosure.
If the evidence is insufficient, return only a disclosure of "Insufficient repository data." and empty arrays.`,
      },
      {
        role: "user",
        content: `Project identity: ${project.githubOwner ?? "unknown"}/${project.githubRepository ?? project.name}
Analyzed commit SHA: ${project.analyzedCommitSha ?? "unknown"}
Original estimate: ${project.estimatedMarketValue ?? "unknown"} USD
Sale readiness: ${JSON.stringify(project.saleReadiness ?? {})}

ANALYSIS EVIDENCE:
${evidence.slice(0, 30000)}`,
      },
    ],
  });
  let packageData: Record<string, unknown>;
  try {
    packageData = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
  } catch {
    packageData = { disclosure: "Unable to parse the generated package.", raw: completion.choices[0]?.message?.content ?? "" };
  }
  const saved = {
    ...packageData,
    generatedAt: new Date().toISOString(),
    analyzedCommitSha: project.analyzedCommitSha,
  };
  const [updated] = await db.update(projectsTable)
    .set({ flippaPackage: saved, updatedAt: new Date() })
    .where(eq(projectsTable.id, id))
    .returning();
  res.json({ package: saved, project: updated });
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

  const openai = getOpenAI();

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    max_completion_tokens: 800,
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
