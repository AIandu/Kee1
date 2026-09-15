import { Router, type IRouter } from "express";
import { desc, count, sql, eq } from "drizzle-orm";
import { db, projectsTable, analysesTable, vaultEntriesTable, tasksTable, auditLogsTable } from "@workspace/db";

const router: IRouter = Router();

const IDEA_PROMPTS = [
  "Which of your projects has the strongest market signal right now?",
  "Is there a project ready for an investor introduction?",
  "What would your Researcher say about your most complex codebase?",
  "Which project could become a SaaS product with minimal effort?",
  "Are there any projects that share enough logic to be merged?",
  "What is the one feature that would most increase your top project's value?",
  "Which project would benefit most from documentation today?",
  "Have you reviewed the Governor findings for all analyzed projects?",
];

function getGreeting(name: string = "Loretta"): string {
  const hour = new Date().getHours();
  if (hour < 12) return `Good morning, ${name}. Kee has been watching your portfolio.`;
  if (hour < 17) return `Good afternoon, ${name}. Here is your intelligence briefing.`;
  return `Good evening, ${name}. Let us review what matters most.`;
}

// Dashboard summary
router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [projectStats] = await db
    .select({
      total: count(),
      avgValue: sql<number>`avg(${projectsTable.valueScore})`,
      avgReadiness: sql<number>`avg(${projectsTable.readinessScore})`,
    })
    .from(projectsTable);

  const [analyzedCount] = await db
    .select({ count: count() })
    .from(projectsTable)
    .where(eq(projectsTable.status, "analyzed"));

  const [pendingTaskCount] = await db
    .select({ count: count() })
    .from(tasksTable)
    .where(sql`${tasksTable.status} IN ('queued', 'running', 'awaiting_approval')`);

  const [vaultCount] = await db
    .select({ count: count() })
    .from(vaultEntriesTable);

  // Top projects
  const topProjects = await db
    .select()
    .from(projectsTable)
    .orderBy(desc(sql`coalesce(${projectsTable.valueScore}, 0)`))
    .limit(5);

  // Status breakdown
  const statusRows = await db
    .select({
      status: projectsTable.status,
      count: count(),
    })
    .from(projectsTable)
    .groupBy(projectsTable.status);

  const statusBreakdown: Record<string, number> = {};
  for (const row of statusRows) {
    statusBreakdown[row.status] = row.count;
  }

  res.json({
    totalProjects: projectStats.total,
    analyzedProjects: analyzedCount.count,
    pendingTasks: pendingTaskCount.count,
    vaultEntries: vaultCount.count,
    avgValueScore: projectStats.avgValue != null ? Math.round(Number(projectStats.avgValue) * 10) / 10 : null,
    avgReadinessScore: projectStats.avgReadiness != null ? Math.round(Number(projectStats.avgReadiness) * 10) / 10 : null,
    topProjects,
    statusBreakdown,
  });
});

// Daily companion
router.get("/dashboard/companion", async (_req, res): Promise<void> => {
  const recentActivity = await buildActivityFeed(5);

  const [pendingAuditCount] = await db
    .select({ count: count() })
    .from(auditLogsTable)
    .where(eq(auditLogsTable.approvalStatus, "pending"));

  const [pendingTaskCount] = await db
    .select({ count: count() })
    .from(tasksTable)
    .where(eq(tasksTable.status, "awaiting_approval"));

  const [awaitingAnalysis] = await db
    .select({ count: count() })
    .from(projectsTable)
    .where(eq(projectsTable.status, "pending"));

  // Shuffle idea prompts and pick 3
  const shuffled = [...IDEA_PROMPTS].sort(() => Math.random() - 0.5).slice(0, 3);

  res.json({
    greeting: getGreeting(),
    date: new Date().toISOString().split("T")[0],
    recentActivity,
    ideaPrompts: shuffled,
    pendingApprovals: pendingAuditCount.count + pendingTaskCount.count,
    projectsAwaitingAnalysis: awaitingAnalysis.count,
  });
});

// Recent activity feed
router.get("/dashboard/activity", async (_req, res): Promise<void> => {
  const activity = await buildActivityFeed(20);
  res.json(activity);
});

async function buildActivityFeed(limit: number) {
  // Gather recent events from audit logs and tasks
  const recentAudit = await db
    .select({
      id: auditLogsTable.id,
      action: auditLogsTable.action,
      projectId: auditLogsTable.projectId,
      createdAt: auditLogsTable.createdAt,
      agent: auditLogsTable.agent,
    })
    .from(auditLogsTable)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit);

  const recentTasks = await db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      status: tasksTable.status,
      projectId: tasksTable.projectId,
      completedAt: tasksTable.completedAt,
      createdAt: tasksTable.createdAt,
    })
    .from(tasksTable)
    .where(eq(tasksTable.status, "completed"))
    .orderBy(desc(tasksTable.createdAt))
    .limit(limit);

  // Get project names for context
  const projects = await db.select({ id: projectsTable.id, name: projectsTable.name }).from(projectsTable);
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));

  const auditItems = recentAudit.map((a, i) => ({
    id: a.id * 1000 + i,
    type: "audit_entry" as const,
    description: a.action,
    projectId: a.projectId,
    projectName: a.projectId ? (projectMap.get(a.projectId) ?? null) : null,
    createdAt: a.createdAt.toISOString(),
  }));

  const taskItems = recentTasks.map((t, i) => ({
    id: t.id * 1000 + i + 500,
    type: "task_completed" as const,
    description: `Task completed: ${t.title}`,
    projectId: t.projectId,
    projectName: t.projectId ? (projectMap.get(t.projectId) ?? null) : null,
    createdAt: (t.completedAt ?? t.createdAt).toISOString(),
  }));

  const combined = [...auditItems, ...taskItems]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);

  return combined;
}

export default router;
