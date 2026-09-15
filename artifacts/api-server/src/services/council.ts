import OpenAI from "openai";
import type { RepoSnapshot } from "./github.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type CouncilRole =
  | "researcher"
  | "engineering_reviewer"
  | "product_analyst"
  | "documentation_specialist"
  | "market_evaluator"
  | "governor";

export type ConfidenceLevel = "confirmed" | "inferred" | "unknown";

export interface CouncilFinding {
  role: CouncilRole;
  content: string;
  confidenceLevel: ConfidenceLevel;
}

export interface GovernorVerdict {
  content: string;
  confidenceLevel: ConfidenceLevel;
  valueScore: number;
  readinessScore: number;
  opportunityScore: number;
  estimatedMarketValue: number;
  estimatedBuildCost: number;
  tags: string[];
  inferredDescription: string;
  primaryLanguage: string;
  classification: "sell" | "hold" | "develop" | "unreviewed";
  valuationBasis: string;
}

export class InsufficientRepositoryDataError extends Error {
  constructor() {
    super("Insufficient repository data.");
    this.name = "InsufficientRepositoryDataError";
  }
}

const EVIDENCE_RULES = `
EVIDENCE GOVERNANCE — NON-NEGOTIABLE:
- Every technical claim must cite an exact repository path in square brackets, for example [src/index.ts].
- Label statements as VERIFIED, INFERENCE, or UNKNOWN.
- VERIFIED means the supplied file content directly supports the statement.
- INFERENCE means a clearly labeled interpretation of supplied evidence; cite the supporting paths.
- UNKNOWN means the supplied repository evidence does not establish the statement. Say UNKNOWN instead of guessing.
- Never use README prose, tags, repository descriptions, stars, or market assumptions as proof that code works.
- Never claim users, revenue, traffic, certifications, uptime, integrations, deployment, or live functionality unless supplied evidence explicitly verifies it.
- Do not produce generic strengths, risks, scores, valuations, buyer recommendations, or documents without cited repository evidence.
`;

function buildContext(snapshot: RepoSnapshot, blind: boolean): string {
  const fileSection = snapshot.keyFiles
    .map((f) => `--- FILE: ${f.path} ---\n${f.content}`)
    .join("\n\n");

  const commitSection = snapshot.recentCommits
    .map((c) => `  ${c.date.slice(0, 10)} [${c.author}] ${c.message}`)
    .join("\n");

  const langSection = Object.entries(snapshot.languages)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([l, b]) => `${l}: ${Math.round((b / Object.values(snapshot.languages).reduce((s, v) => s + v, 0)) * 100)}%`)
    .join(", ");

  const meta = blind
    ? `REPOSITORY STATS (blind mode)
Stars: ${snapshot.metadata.stars} | Forks: ${snapshot.metadata.forks} | Open Issues: ${snapshot.metadata.openIssues} | Open PRs: ${snapshot.openPRs}
Size: ${snapshot.metadata.size}KB | License: ${snapshot.metadata.license ?? "none"} | Created: ${snapshot.metadata.createdAt.slice(0, 10)} | Last updated: ${snapshot.metadata.updatedAt.slice(0, 10)}
Languages: ${langSection}
File count: ${snapshot.fileTree.length}`
    : `REPOSITORY: ${snapshot.metadata.fullName}
Description: ${snapshot.metadata.description ?? "none"}
Stars: ${snapshot.metadata.stars} | Forks: ${snapshot.metadata.forks} | Open Issues: ${snapshot.metadata.openIssues} | Open PRs: ${snapshot.openPRs}
Primary language: ${snapshot.metadata.language} | License: ${snapshot.metadata.license ?? "none"}
Topics: ${snapshot.metadata.topics.join(", ") || "none"}
Created: ${snapshot.metadata.createdAt.slice(0, 10)} | Last updated: ${snapshot.metadata.updatedAt.slice(0, 10)}
Languages: ${langSection}
File count: ${snapshot.fileTree.length}`;

  return `${meta}

FILE TREE (first 100):
${snapshot.fileTree.slice(0, 100).join("\n")}

RECENT COMMITS:
${commitSection}

KEY FILE CONTENTS:
${fileSection}`;
}

async function gpt(system: string, user: string, maxTokens = 2000): Promise<string> {
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: `${EVIDENCE_RULES}\n${system}` },
      { role: "user", content: user },
    ],
  });
  return res.choices[0]?.message?.content ?? "";
}

// ─── Role 1: Code Audit ───────────────────────────────────────────────────────
// Appears in "Code Analysis" tab — what's broken, what's solid, specific fixes

async function runResearcher(snapshot: RepoSnapshot, blind: boolean): Promise<CouncilFinding> {
  const context = buildContext(snapshot, blind);
  const content = await gpt(
    `You are Kee's Code Auditor. Read the actual source code files provided and produce a thorough technical audit.

Your output must have these clearly labeled sections:

## WHAT'S WORKING WELL
List 3-6 concrete strengths with specific file/function references. Be specific — not generic praise.

## BUGS & ISSUES
List every bug, error, or broken pattern you can identify. For each: file name, what's wrong, severity (Critical/High/Medium/Low).

## SECURITY CONCERNS  
Identify any security vulnerabilities: exposed secrets, SQL injection risk, unvalidated inputs, insecure dependencies.

## CODE SMELLS & TECH DEBT
Patterns that will cause problems at scale: duplicated logic, missing error handling, hardcoded values, etc.

## QUICK WINS (under 2 hours each)
List 3-5 specific, small code fixes that would meaningfully improve the project. For each: exact file, what to change, why it matters.`,
    context,
    2500
  );
  return { role: "researcher", content, confidenceLevel: "confirmed" };
}

// ─── Role 2: Improvement Roadmap ─────────────────────────────────────────────
// Appears in "Code Analysis" tab — architecture + prioritized improvement plan

async function runEngineeringReviewer(snapshot: RepoSnapshot, blind: boolean): Promise<CouncilFinding> {
  const context = buildContext(snapshot, blind);
  const content = await gpt(
    `You are Kee's Engineering Strategist. Assess the architecture and produce a prioritized improvement roadmap.

Your output must have these clearly labeled sections:

## ARCHITECTURE ASSESSMENT
How is the project structured? Is it scalable? What's the overall quality of the architecture (1-10) and why?

## MISSING FOUNDATIONS
What critical pieces are absent? (tests, CI/CD, error boundaries, logging, auth, rate limiting, etc.)

## IMPROVEMENT ROADMAP
Prioritized list of improvements. For each item:
- Priority: HIGH / MEDIUM / LOW
- What: specific change
- Why: business/technical impact
- Effort: hours estimate

## SCALE READINESS
What would need to change for this to handle 10x users? 100x?

## TECHNOLOGY EVALUATION
Are the technology choices appropriate for the project's goals? Any recommendations to swap?`,
    context,
    2500
  );
  return { role: "engineering_reviewer", content, confidenceLevel: "inferred" };
}

// ─── Role 3: README / White Paper ────────────────────────────────────────────
// Appears in "White Paper" tab — full professional README draft

async function runProductAnalyst(snapshot: RepoSnapshot, blind: boolean): Promise<CouncilFinding> {
  const context = buildContext(snapshot, blind);
  const content = await gpt(
    `You are Kee's Documentation Writer. Your job is to write a complete, professional README.md for this project that Loretta can use immediately.

Write a full README.md in proper Markdown. It must include:

# [Project Name]

A crisp one-line description.

## What It Does
Clear explanation of the product — what problem it solves, for whom.

## Key Features
Bullet list of the most impressive/useful features (infer from the code).

## Tech Stack
The actual technologies used (from the code).

## Getting Started
### Prerequisites
### Installation
### Configuration (env vars if any)
### Running the Project

## Architecture Overview
Brief explanation of how the pieces fit together.

## API Reference (if applicable)
Key endpoints with method, path, description.

## Roadmap
3-5 natural next features based on the current state.

## License
Based on the repo's license file if present.

---
Write this as if it will be published on GitHub today. Make it compelling and accurate based on the actual code.`,
    context,
    3000
  );
  return { role: "product_analyst", content, confidenceLevel: "inferred" };
}

// ─── Role 4: Outreach Strategy ────────────────────────────────────────────────
// Appears in "Outreach" tab — who to pitch, what to say

async function runDocumentationSpecialist(snapshot: RepoSnapshot, blind: boolean): Promise<CouncilFinding> {
  const context = buildContext(snapshot, blind);
  const content = await gpt(
    `You are Kee's Outreach Strategist. Based on this software project, tell Loretta exactly who to pitch to and how.

Your output must have these clearly labeled sections:

## WHO SHOULD BUY THIS
Name specific types of companies (and real company examples if applicable) that would most benefit from this project. Explain why each is a fit.

## ACQUISITION TARGETS
Which companies might want to acquire this outright? Why would they pay for it? What's the strategic value to them?

## INVESTOR PITCH ANGLE
If raising funding, what's the one-sentence pitch? What category does this fit (SaaS, developer tool, marketplace, etc.)? Which types of investors (seed, Series A, strategic) are appropriate?

## COLD OUTREACH TEMPLATE
Write a short, compelling cold email Loretta can send to a potential buyer or partner. Keep it under 150 words. Make it specific to this project.

## RECOMMENDED FIRST STEPS
The 3 most important actions Loretta should take in the next 30 days to move this project toward a sale or partnership.`,
    context,
    2000
  );
  return { role: "documentation_specialist", content, confidenceLevel: "inferred" };
}

// ─── Role 5: Market Report ────────────────────────────────────────────────────
// Appears in "Outreach" tab — market value, competitors, pricing

async function runMarketEvaluator(snapshot: RepoSnapshot, blind: boolean): Promise<CouncilFinding> {
  const context = buildContext(snapshot, blind);
  const content = await gpt(
    `You are Kee's Market Analyst. Produce a grounded, conservative market evaluation for this software project. Do NOT inflate values — buyers are sophisticated and will walk away from unrealistic numbers.

Your output must have these clearly labeled sections:

## MARKET CATEGORY
What space does this compete in? Be specific (e.g., "Developer tooling / AI-assisted code review — small segment of the $6B DevOps market").

## HONEST MATURITY ASSESSMENT
How production-ready is this really? Rate: Prototype / Alpha / Beta / Production-Ready. Explain what evidence supports this rating (commit frequency, test coverage observed, documentation quality, etc.).

## DIRECT COMPETITORS
List 3-5 real competitors. For each: name, pricing model, key strength vs this project, key weakness.

## REALISTIC VALUATION METHODOLOGY
Walk through your reasoning step by step:
1. What comparable sales or revenue multiples apply to this type of project?
2. What evidence from the code/commits supports or limits the valuation?
3. What would a strategic buyer pay vs a financial buyer?

## VALUATION RANGE
Give a LOW (distressed/quick sale), MID (fair market), and HIGH (strategic acquirer) value — not a single number.
- LOW: $[amount] — [one sentence why]
- MID: $[amount] — [one sentence why]  
- HIGH: $[amount] — [one sentence why]

ESTIMATED_MARKET_VALUE: [MID value as integer USD, no symbols — be conservative, most indie projects sell for $5K-$150K, not millions]
ESTIMATED_BUILD_COST: [realistic cost to rebuild this from scratch with freelancers, integer USD]

## REVENUE MODEL OPTIONS
Which fits best and why? Be specific about pricing tiers if recommending SaaS.

## TIME TO REVENUE
Realistic timeline with specific milestones.`,
    context,
    2200
  );
  return { role: "market_evaluator", content, confidenceLevel: "inferred" };
}

// ─── Role 6: Kee's Summary (Governor) ────────────────────────────────────────
// Appears in "Overview" tab — executive synthesis + all scores

async function runGovernor(
  snapshot: RepoSnapshot,
  findings: CouncilFinding[]
): Promise<GovernorVerdict> {
  const findingsSummary = findings
    .filter(f => !f.content.startsWith("[Role unavailable"))
    .map((f) => `=== ${f.role.toUpperCase()} ===\n${f.content}`)
    .join("\n\n");

  const raw = await gpt(
    `You are Kee — a decisive cognitive partner and software intelligence. You have received analysis from your team on a software repository. Synthesize it into an honest executive briefing for Loretta. She is making real business decisions based on what you tell her — do not flatter or inflate.

Your response MUST follow this exact format:

VERDICT:
[Write 300-500 words. Lead with the single most important truth about this project — what it actually is, not what it aspires to be. Assess: is this a real asset or a prototype? What is the genuine opportunity? What are the honest risks? What is the ONE most important thing Loretta should do first? Be direct. No corporate speak. Write as Kee speaking privately to Loretta.]

CONFIDENCE: [confirmed|inferred|unknown — confirmed means you saw substantial working code; inferred means limited code available; unknown means the repo was empty or inaccessible]
VALUE_SCORE: [0-100 — honest quality and completeness score. Most indie projects score 20-60. A polished, well-tested, documented project scores 70+. Perfect code with users = 85+]
READINESS_SCORE: [0-100 — could Loretta show this to a buyer TODAY without embarrassment? Be harsh here.]
OPPORTUNITY_SCORE: [0-100 — commercial potential of the concept and execution combined]
ESTIMATED_MARKET_VALUE: [integer USD — what a real buyer would pay today. Most indie repos: $3,000-$50,000. Polished SaaS with users: $50,000-$500,000. Only use higher numbers if the team analysis found clear evidence of revenue or strategic value. Base it on the market evaluator's MID estimate.]
ESTIMATED_BUILD_COST: [integer USD — freelancer cost to rebuild from scratch. Be realistic.]
INFERRED_DESCRIPTION: [one crisp sentence: what this software does and for whom]
PRIMARY_LANGUAGE: [dominant programming language]
TAGS: [3-6 comma-separated lowercase tags, e.g. saas,react,typescript,devtools]`,
    `Repository: ${snapshot.metadata.fullName}
Stars: ${snapshot.metadata.stars} | Forks: ${snapshot.metadata.forks} | Size: ${snapshot.metadata.size}KB | Last commit: ${snapshot.metadata.updatedAt?.slice(0, 10) ?? 'unknown'}

TEAM ANALYSIS:

${findingsSummary}`,
    2000
  );

  function extract(key: string): string {
    const match = raw.match(new RegExp(`${key}:\\s*(.+?)(?=\\n[A-Z_]+:|$)`, "s"));
    return match ? match[1].trim() : "";
  }
  function extractNum(key: string, fallback: number): number {
    const match = raw.match(new RegExp(`${key}:\\s*(\\d+)`));
    return match ? parseInt(match[1], 10) : fallback;
  }

  const verdictMatch = raw.match(/VERDICT:\s*([\s\S]+?)(?=\nCONFIDENCE:)/);
  const verdictText = verdictMatch ? verdictMatch[1].trim() : raw;

  const confidenceRaw = extract("CONFIDENCE").toLowerCase();
  const confidence: ConfidenceLevel =
    confidenceRaw === "confirmed" ? "confirmed" : confidenceRaw === "inferred" ? "inferred" : "unknown";

  const tags = extract("TAGS").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 6);

  return {
    content: verdictText,
    confidenceLevel: confidence,
    valueScore: extractNum("VALUE_SCORE", 50),
    readinessScore: extractNum("READINESS_SCORE", 50),
    opportunityScore: extractNum("OPPORTUNITY_SCORE", 50),
    estimatedMarketValue: extractNum("ESTIMATED_MARKET_VALUE", 0),
    estimatedBuildCost: extractNum("ESTIMATED_BUILD_COST", 0),
    tags,
    inferredDescription: extract("INFERRED_DESCRIPTION"),
    primaryLanguage: extract("PRIMARY_LANGUAGE"),
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function runFullCouncil(
  snapshot: RepoSnapshot,
  blind: boolean
): Promise<{ findings: CouncilFinding[]; verdict: GovernorVerdict }> {
  const results = await Promise.allSettled([
    runResearcher(snapshot, blind),
    runEngineeringReviewer(snapshot, blind),
    runProductAnalyst(snapshot, blind),
    runDocumentationSpecialist(snapshot, blind),
    runMarketEvaluator(snapshot, blind),
  ]);

  const roles: CouncilRole[] = [
    "researcher",
    "engineering_reviewer",
    "product_analyst",
    "documentation_specialist",
    "market_evaluator",
  ];

  const findings: CouncilFinding[] = results.map((result, i) => {
    if (result.status === "fulfilled") return result.value;
    console.warn(`[council] ${roles[i]} failed:`, result.reason?.message ?? result.reason);
    return {
      role: roles[i],
      content: `[Role unavailable: ${result.reason?.message ?? "unknown error"}]`,
      confidenceLevel: "unknown" as ConfidenceLevel,
    };
  });

  const verdict = await runGovernor(snapshot, findings);
  return { findings, verdict };
}
