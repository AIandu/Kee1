import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { RepoSnapshot } from "./github.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
}

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
    ? `REPOSITORY STATS (blind mode — no author context)
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

// ─── Individual council roles ────────────────────────────────────────────────

async function runResearcher(snapshot: RepoSnapshot, blind: boolean): Promise<CouncilFinding> {
  const context = buildContext(snapshot, blind);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: `You are the Researcher on Kee's AI Council. Your role is to establish factual, verifiable truth about a software repository.

Analyze the provided repository data and produce a rigorous research report covering:
1. Development timeline and activity patterns (infer from commit history and dates)
2. Project maturity signals (commit frequency, issue velocity, contributor patterns)
3. Technology stack confirmation (languages, frameworks, dependencies)
4. Repository health indicators (license, CI/CD presence, test files, documentation)
5. Any anomalies or contradictions in the data

Be precise. Label each claim as CONFIRMED (directly evidenced) or INFERRED (reasonably deduced). Do not speculate beyond the data. Use specific dates, counts, and facts from the data.`,
    messages: [{ role: "user", content: context }],
  });

  const text = message.content.find((b) => b.type === "text")?.text ?? "";
  const hasConfirmed = text.includes("CONFIRMED");
  return {
    role: "researcher",
    content: text,
    confidenceLevel: hasConfirmed ? "confirmed" : "inferred",
  };
}

async function runEngineeringReviewer(snapshot: RepoSnapshot, blind: boolean): Promise<CouncilFinding> {
  const context = buildContext(snapshot, blind);

  const message = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 8192,
    system: `You are the Engineering Reviewer on Kee's AI Council. You are a senior software architect evaluating a codebase for technical quality, scalability, and investment readiness.

Analyze the provided repository and produce a detailed engineering assessment covering:
1. Architecture pattern (identify: monolith, microservices, layered, hexagonal, event-driven, etc.)
2. Code quality signals (naming conventions, modularity, separation of concerns)
3. Security posture (auth patterns, input validation, secret handling visible in code)
4. Scalability architecture (stateless vs stateful, database patterns, caching)
5. Test coverage signals (test file presence, testing frameworks, coverage patterns)
6. CI/CD maturity (GitHub Actions, deployment configuration)
7. Technical debt indicators
8. Critical risks that would block commercialization

Score: At the end of your analysis, provide a READINESS_SCORE: [0-100] and TECHNICAL_RISK: [low/medium/high].`,
    messages: [{ role: "user", content: context }],
  });

  const text = message.content.find((b) => b.type === "text")?.text ?? "";
  return {
    role: "engineering_reviewer",
    content: text,
    confidenceLevel: text.toLowerCase().includes("confirmed") ? "confirmed" : "inferred",
  };
}

async function runProductAnalyst(snapshot: RepoSnapshot, blind: boolean): Promise<CouncilFinding> {
  const context = buildContext(snapshot, blind);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 8192,
    messages: [
      {
        role: "system",
        content: `You are the Product Analyst on Kee's AI Council. You identify what software products actually do, who they serve, and what product gaps exist.

Analyze the provided repository and produce a product analysis covering:
1. Core product hypothesis: What problem does this solve? For whom?
2. User journey inference: What are the primary user flows? (infer from routes, components, or scripts)
3. Feature completeness: What's built vs what's clearly missing?
4. Onboarding gap: Is there a first-run experience?
5. Monetization signals: Is there any payment, subscription, or pricing infrastructure?
6. Product category: What product type is this? (Dev tool, B2B SaaS, consumer app, API, library, etc.)
7. Ideal Customer Profile (ICP): Who would pay for this and why?
8. Top 3 product improvements before market launch

Be decisive. Make calls even with incomplete data — label uncertain conclusions as INFERRED.`,
      },
      { role: "user", content: context },
    ],
  });

  const text = response.choices[0]?.message?.content ?? "";
  return {
    role: "product_analyst",
    content: text,
    confidenceLevel: "inferred",
  };
}

async function runDocumentationSpecialist(snapshot: RepoSnapshot, blind: boolean): Promise<CouncilFinding> {
  const context = buildContext(snapshot, blind);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 8192,
    messages: [
      {
        role: "system",
        content: `You are the Documentation Specialist on Kee's AI Council. You assess how well a software project explains itself and whether it is investor- and buyer-ready from a knowledge transfer perspective.

Analyze the repository and produce a documentation assessment covering:
1. README quality: Is it clear, complete, and compelling? Does it explain setup, usage, and purpose?
2. Code documentation: Are key files, functions, and modules commented?
3. API documentation: Are endpoints, inputs, and outputs documented?
4. Contribution guide: Is there a CONTRIBUTING.md or equivalent?
5. Changelog: Is there a CHANGELOG.md or release notes?
6. Setup instructions: Can a developer clone and run this in under 10 minutes?
7. Missing documentation gaps that would block enterprise adoption
8. Documentation score: DOCUMENTATION_SCORE: [0-100]`,
      },
      { role: "user", content: context },
    ],
  });

  const text = response.choices[0]?.message?.content ?? "";
  return {
    role: "documentation_specialist",
    content: text,
    confidenceLevel: "inferred",
  };
}

async function runMarketEvaluator(snapshot: RepoSnapshot, blind: boolean): Promise<CouncilFinding> {
  const context = buildContext(snapshot, blind);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 2048,
    messages: [
      {
        role: "system",
        content: `You are the Market Evaluator on Kee's AI Council. You are a venture-capital-trained market analyst who evaluates software assets for commercial potential.

Analyze the provided repository and produce a market evaluation covering:
1. Market category identification: What market does this compete in?
2. Total Addressable Market (TAM) estimate with reasoning
3. Top 3-5 direct competitors (named companies/products) with pricing and traction
4. Differentiation analysis: What unique advantage does this project have?
5. Acquisition target profile: What type of company would acquire this and why?
6. Revenue model options: SaaS, license, open-core, API credits, marketplace?
7. Time-to-revenue estimate: How long to first dollar if properly resourced?
8. Market timing: Is this ahead, in-time, or behind the market?
9. OPPORTUNITY_SCORE: [0-100] — commercial opportunity strength
10. ESTIMATED_MARKET_VALUE: [$X] — estimated fair acquisition value`,
      },
      { role: "user", content: context },
    ],
  });

  const text = response.choices[0]?.message?.content ?? "";
  return {
    role: "market_evaluator",
    content: text,
    confidenceLevel: "inferred",
  };
}

async function runGovernor(
  snapshot: RepoSnapshot,
  findings: CouncilFinding[]
): Promise<GovernorVerdict> {
  const findingsSummary = findings
    .map(
      (f) =>
        `=== ${f.role.toUpperCase()} (confidence: ${f.confidenceLevel}) ===\n${f.content}`
    )
    .join("\n\n");

  const message = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 8192,
    system: `You are the Governor on Kee's AI Council — the final arbiter and synthesizer. Your role is to:
1. Review all council findings
2. Identify agreements and contradictions between council members
3. Produce a decisive, authoritative final verdict
4. Assign calibrated scores based on the evidence

You must output your response in this EXACT format (do not deviate):

VERDICT:
[Your 400-600 word synthesis of all findings. Be decisive and actionable. Note any contradictions between council members and how you resolved them.]

CONFIDENCE: [confirmed|inferred|unknown]
VALUE_SCORE: [0-100]
READINESS_SCORE: [0-100]
OPPORTUNITY_SCORE: [0-100]
ESTIMATED_MARKET_VALUE: [number in USD, no commas or symbols, e.g. 450000]
ESTIMATED_BUILD_COST: [number in USD, no commas or symbols, e.g. 180000]
INFERRED_DESCRIPTION: [one crisp sentence describing what this software does and for whom]
PRIMARY_LANGUAGE: [the dominant programming language]
TAGS: [comma-separated list of 3-6 relevant tags, e.g. saas,devtools,react,open-source]`,
    messages: [
      {
        role: "user",
        content: `Repository: ${snapshot.metadata.fullName}\n\nCOUNCIL FINDINGS:\n\n${findingsSummary}`,
      },
    ],
  });

  const raw = message.content.find((b) => b.type === "text")?.text ?? "";

  // Parse the structured output
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
    confidenceRaw === "confirmed"
      ? "confirmed"
      : confidenceRaw === "inferred"
      ? "inferred"
      : "unknown";

  const tags = extract("TAGS")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 6);

  return {
    content: raw,
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

// ─── Main entry point ────────────────────────────────────────────────────────

export async function runFullCouncil(
  snapshot: RepoSnapshot,
  blind: boolean
): Promise<{ findings: CouncilFinding[]; verdict: GovernorVerdict }> {
  // Run all five council members in parallel — fault-tolerant: one failure won't sink the rest
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

  // Governor synthesizes everything (even partial results)
  const verdict = await runGovernor(snapshot, findings);

  return { findings, verdict };
}
