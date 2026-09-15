import { Octokit } from "@octokit/rest";

const githubTokens = [process.env.GITHUB_TOKEN, process.env.GITHUB_TOKEN2].filter(
  (token): token is string => Boolean(token)
);
const githubClients = githubTokens.length
  ? githubTokens.map((token) => new Octokit({ auth: token }))
  : [new Octokit()];

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com[\/:]([^\/]+)\/([^\/\s#?]+?)(?:\.git)?(?:[\/\s#?]|$)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

export interface RepoFile {
  path: string;
  content: string;
}

export interface RepoSnapshot {
  metadata: {
    fullName: string;
    description: string | null;
    language: string | null;
    stars: number;
    forks: number;
    openIssues: number;
    topics: string[];
    createdAt: string;
    updatedAt: string;
    defaultBranch: string;
    license: string | null;
    size: number;
    latestCommitSha: string | null;
  };
  languages: Record<string, number>;
  fileTree: string[];
  keyFiles: RepoFile[];
  recentCommits: Array<{ message: string; date: string; author: string }>;
  openPRs: number;
}

export type SaleReadinessCheck = {
  status: "verified" | "not_found" | "risk" | "unknown";
  evidence: string[];
  note: string;
};

export type SaleReadinessReport = {
  readme: SaleReadinessCheck;
  license: SaleReadinessCheck;
  buildConfiguration: SaleReadinessCheck;
  tests: SaleReadinessCheck;
  deploymentInstructions: SaleReadinessCheck;
  environmentVariableDocumentation: SaleReadinessCheck;
  exposedSecretRisk: SaleReadinessCheck;
  placeholderOrDemoData: SaleReadinessCheck;
  brokenIntegrations: SaleReadinessCheck;
  unsupportedMarketingClaims: SaleReadinessCheck;
  requiredBeforeSale: string[];
};

// Priority file patterns — ordered by importance
const PRIORITY_PATTERNS = [
  /^README(\.(md|txt|rst))?$/i,
  /^package\.json$/,
  /^requirements\.txt$/,
  /^go\.mod$/,
  /^Cargo\.toml$/,
  /^pyproject\.toml$/,
  /^setup\.py$/,
  /^Makefile$/,
  /^docker-compose\.ya?ml$/,
  /^\.github\/workflows\/.+\.ya?ml$/i,
  /^src\/index\.(ts|tsx|js|jsx)$/,
  /^src\/main\.(ts|tsx|js|jsx|py|go|rs)$/,
  /^src\/app\.(ts|tsx|js|jsx)$/,
  /^main\.(py|go|rs|ts|js)$/,
  /^index\.(py|go|rs|ts|js)$/,
  /^app\.(py|go|rs|ts|js)$/,
];

const SKIP_PATTERNS = [
  /node_modules/,
  /\.min\.(js|css)$/,
  /dist\//,
  /build\//,
  /\.lock$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /\.git\//,
  /\.png$|\.jpg$|\.jpeg$|\.gif$|\.svg$|\.ico$|\.woff|\.ttf|\.eot/,
  /\.map$/,
];

function priorityScore(path: string): number {
  for (let i = 0; i < PRIORITY_PATTERNS.length; i++) {
    if (PRIORITY_PATTERNS[i].test(path)) return PRIORITY_PATTERNS.length - i;
  }
  return 0;
}

function shouldSkip(path: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(path));
}

async function fetchFileContent(
  client: Octokit,
  owner: string,
  repo: string,
  path: string
): Promise<string | null> {
  try {
    const { data } = await client.repos.getContent({ owner, repo, path });
    if (Array.isArray(data) || data.type !== "file") return null;
    const content = "content" in data ? data.content : null;
    if (!content) return null;
    return Buffer.from(content, "base64").toString("utf-8").slice(0, 8000);
  } catch {
    return null;
  }
}

async function getFileTree(
  client: Octokit,
  owner: string,
  repo: string,
  branch: string
): Promise<string[]> {
  try {
    const { data } = await client.git.getTree({
      owner,
      repo,
      tree_sha: branch,
      recursive: "1",
    });
    return (data.tree ?? [])
      .filter((f) => f.type === "blob" && f.path && !shouldSkip(f.path))
      .map((f) => f.path!)
      .slice(0, 500);
  } catch {
    return [];
  }
}

export async function fetchRepoSnapshot(
  owner: string,
  repo: string
): Promise<RepoSnapshot> {
  // Try each account so private repos from either GitHub account are accessible.
  let repoData: Awaited<ReturnType<Octokit["repos"]["get"]>> | null = null;
  let client: Octokit | null = null;
  let lastError: unknown;
  for (const candidate of githubClients) {
    try {
      repoData = await candidate.repos.get({ owner, repo });
      client = candidate;
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!repoData || !client) {
    throw lastError instanceof Error ? lastError : new Error(`Unable to access GitHub repository ${owner}/${repo}`);
  }

  // Use the account that can see the repo for all subsequent private-repo requests.
  const [languagesData, commitsData, prsData] = await Promise.all([
    client.repos.listLanguages({ owner, repo }).catch(() => ({ data: {} })),
    client.repos
      .listCommits({ owner, repo, per_page: 20 })
      .catch(() => ({ data: [] })),
    client.pulls
      .list({ owner, repo, state: "open", per_page: 1 })
      .catch(() => ({ data: [], headers: {} })),
  ]);

  const r = repoData.data;
  const branch = r.default_branch;

  // Get file tree
  const fileTree = await getFileTree(client, owner, repo, branch);

  // Select files to read: priority files first, then top source files
  const prioritized = fileTree
    .map((path) => ({ path, score: priorityScore(path) }))
    .sort((a, b) => b.score - a.score);

  // Take up to 12 files: all priority-matched + fill with src files
  const toFetch = [
    ...prioritized.filter((f) => f.score > 0).slice(0, 8),
    ...prioritized
      .filter(
        (f) =>
          f.score === 0 &&
          /\.(ts|tsx|js|jsx|py|go|rs|java|rb|php|cs|cpp|c|swift|kt)$/.test(
            f.path
          ) &&
          !f.path.includes("test") &&
          !f.path.includes("spec") &&
          !f.path.includes("__tests__")
      )
      .slice(0, 4),
  ].slice(0, 12);

  // Fetch file contents in parallel
  const fileResults = await Promise.all(
    toFetch.map(async ({ path }) => {
      const content = await fetchFileContent(client, owner, repo, path);
      return content ? { path, content } : null;
    })
  );

  const keyFiles = fileResults.filter((f): f is RepoFile => f !== null);

  const recentCommits = commitsData.data.slice(0, 20).map((c) => ({
    message: c.commit.message.split("\n")[0].slice(0, 120),
    date: c.commit.author?.date ?? "",
    author: c.commit.author?.name ?? "unknown",
  }));

  // Get open PR count from Link header or data length
  let openPRs = prsData.data.length;
  try {
    const fullPRs = await client.pulls.list({
      owner,
      repo,
      state: "open",
      per_page: 100,
    });
    openPRs = fullPRs.data.length;
  } catch {
    // keep estimate
  }

  return {
    metadata: {
      fullName: r.full_name,
      description: r.description ?? null,
      language: r.language ?? null,
      stars: r.stargazers_count ?? 0,
      forks: r.forks_count ?? 0,
      openIssues: r.open_issues_count ?? 0,
      topics: r.topics ?? [],
      createdAt: r.created_at ?? "",
      updatedAt: r.updated_at ?? "",
      defaultBranch: branch,
      license: r.license?.spdx_id ?? null,
      size: r.size ?? 0,
      latestCommitSha: commitsData.data[0]?.sha ?? null,
    },
    languages: languagesData.data as Record<string, number>,
    fileTree,
    keyFiles,
    recentCommits,
    openPRs,
  };
}

function firstMatching(paths: string[], patterns: RegExp[]): string[] {
  return paths.filter((path) => patterns.some((pattern) => pattern.test(path)));
}

function contentMatches(files: RepoFile[], pattern: RegExp): string[] {
  return files.filter((file) => pattern.test(file.content)).map((file) => file.path);
}

export function buildSaleReadiness(snapshot: RepoSnapshot): SaleReadinessReport {
  const paths = snapshot.fileTree;
  const files = snapshot.keyFiles;
  const readmes = firstMatching(paths, [/^README(?:\.(md|txt|rst))?$/i]);
  const licenses = firstMatching(paths, [/^LICEN[CS]E(?:\..*)?$/i, /^COPYING(?:\..*)?$/i]);
  const builds = firstMatching(paths, [
    /^package\.json$/i,
    /^requirements\.txt$/i,
    /^pyproject\.toml$/i,
    /^go\.mod$/i,
    /^Cargo\.toml$/i,
    /^Makefile$/i,
    /^Dockerfile$/i,
    /^docker-compose\.ya?ml$/i,
  ]);
  const tests = firstMatching(paths, [
    /(^|\/)(__tests__|tests?|specs?)(\/|$)/i,
    /\.(test|spec)\.[^.]+$/i,
  ]);
  const deployment = firstMatching(paths, [
    /^\.github\/workflows\//i,
    /^Dockerfile$/i,
    /^(render|railway|fly|vercel|netlify)\.(json|ya?ml)$/i,
    /^docker-compose\.ya?ml$/i,
  ]);
  const envDocs = firstMatching(paths, [
    /^\.env\.example$/i,
    /^\.env\.template$/i,
    /(^|\/)CONFIGURATION(?:\..*)?$/i,
  ]);

  const secretEvidence = contentMatches(
    files,
    /(sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|AKIA[0-9A-Z]{16})/
  );
  const placeholderEvidence = contentMatches(
    files,
    /\b(TODO|FIXME|lorem ipsum|placeholder|demo data|sample data|mock data|coming soon)\b/i
  );

  const makeCheck = (
    status: SaleReadinessCheck["status"],
    evidence: string[],
    note: string
  ): SaleReadinessCheck => ({ status, evidence, note });

  const report: SaleReadinessReport = {
    readme: readmes.length
      ? makeCheck("verified", readmes, "README file exists.")
      : makeCheck("not_found", [], "No README file was found in the repository tree."),
    license: licenses.length || snapshot.metadata.license
      ? makeCheck("verified", licenses.length ? licenses : ["GitHub repository metadata"], "A license is present.")
      : makeCheck("not_found", [], "No license file or GitHub license metadata was found."),
    buildConfiguration: builds.length
      ? makeCheck("verified", builds, "A recognizable build or dependency configuration exists.")
      : makeCheck("not_found", [], "No recognizable build configuration was found."),
    tests: tests.length
      ? makeCheck("verified", tests.slice(0, 10), "Test-looking paths were found; execution was not performed.")
      : makeCheck("unknown", [], "No test paths were found in the sampled repository tree."),
    deploymentInstructions: deployment.length
      ? makeCheck("verified", deployment.slice(0, 10), "Deployment-related configuration was found; deployment was not verified.")
      : makeCheck("unknown", [], "No deployment configuration or instructions were found in the sampled tree."),
    environmentVariableDocumentation: envDocs.length
      ? makeCheck("verified", envDocs, "Environment-variable documentation or a template exists.")
      : makeCheck("unknown", [], "No environment-variable documentation was found."),
    exposedSecretRisk: secretEvidence.length
      ? makeCheck("risk", secretEvidence, "A secret-like value was detected in sampled file contents; rotate and investigate it.")
      : makeCheck("verified", [], "No common secret patterns were detected in sampled file contents; this is not proof of safety."),
    placeholderOrDemoData: placeholderEvidence.length
      ? makeCheck("risk", placeholderEvidence, "Placeholder or demo-data markers were detected.")
      : makeCheck("unknown", [], "No placeholder markers were detected in sampled files; absence is not proof of production data."),
    brokenIntegrations: makeCheck("unknown", [], "Repository inspection cannot prove that external integrations work at runtime."),
    unsupportedMarketingClaims: makeCheck("unknown", [], "Repository inspection cannot validate marketing claims without independent evidence."),
    requiredBeforeSale: [],
  };

  const required: string[] = [];
  if (report.readme.status !== "verified") required.push("Add or complete a README with setup and product facts.");
  if (report.license.status !== "verified") required.push("Add a clear license.");
  if (report.buildConfiguration.status !== "verified") required.push("Add a reproducible build configuration.");
  if (report.tests.status !== "verified") required.push("Add and run a documented test suite.");
  if (report.deploymentInstructions.status !== "verified") required.push("Document deployment and operating requirements.");
  if (report.environmentVariableDocumentation.status !== "verified") required.push("Document required environment variables without including secrets.");
  if (report.exposedSecretRisk.status === "risk") required.push("Remove and rotate any exposed secrets before sale.");
  if (report.placeholderOrDemoData.status === "risk") required.push("Remove or clearly label placeholder and demo data.");
  required.push("Independently verify integrations and marketing claims before listing.");
  if (!snapshot.metadata.latestCommitSha) required.push("Confirm the repository has a real commit history.");
  report.requiredBeforeSale = required;
  return report;
}

export async function listUserRepos(
  page = 1,
  perPage = 50
): Promise<
  Array<{
    name: string;
    fullName: string;
    url: string;
    description: string | null;
    language: string | null;
    stars: number;
    updatedAt: string;
    private: boolean;
  }>
> {
  const results = await Promise.allSettled(
    githubClients.map((client) =>
      client.repos.listForAuthenticatedUser({
        sort: "updated",
        per_page: perPage,
        page,
      })
    )
  );

  const successful = results
    .filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<Octokit["repos"]["listForAuthenticatedUser"]>>> =>
        result.status === "fulfilled"
    )
    .flatMap((result) => result.value.data);

  if (successful.length === 0) {
    const firstFailure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    throw firstFailure?.reason ?? new Error("No GitHub accounts could be accessed");
  }

  const uniqueRepos = new Map<string, (typeof successful)[number]>();
  for (const repo of successful) {
    uniqueRepos.set(repo.full_name, repo);
  }

  return [...uniqueRepos.values()]
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
    .map((r) => ({
      name: r.name,
      fullName: r.full_name,
      url: r.html_url,
      description: r.description ?? null,
      language: r.language ?? null,
      stars: r.stargazers_count ?? 0,
      updatedAt: r.updated_at ?? "",
      private: r.private,
    }));
}
