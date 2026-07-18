import { Octokit } from "@octokit/rest";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com[\/:]([^\/]+)\/([^\/\s]+?)(?:\.git)?(?:\/|$)?/);
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
  };
  languages: Record<string, number>;
  fileTree: string[];
  keyFiles: RepoFile[];
  recentCommits: Array<{ message: string; date: string; author: string }>;
  openPRs: number;
}

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
  owner: string,
  repo: string,
  path: string
): Promise<string | null> {
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path });
    if (Array.isArray(data) || data.type !== "file") return null;
    const content = "content" in data ? data.content : null;
    if (!content) return null;
    return Buffer.from(content, "base64").toString("utf-8").slice(0, 8000);
  } catch {
    return null;
  }
}

async function getFileTree(
  owner: string,
  repo: string,
  branch: string
): Promise<string[]> {
  try {
    const { data } = await octokit.git.getTree({
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
  // Fetch metadata, languages, commits, and PRs in parallel
  const [repoData, languagesData, commitsData, prsData] = await Promise.all([
    octokit.repos.get({ owner, repo }),
    octokit.repos.listLanguages({ owner, repo }).catch(() => ({ data: {} })),
    octokit.repos
      .listCommits({ owner, repo, per_page: 20 })
      .catch(() => ({ data: [] })),
    octokit.pulls
      .list({ owner, repo, state: "open", per_page: 1 })
      .catch(() => ({ data: [], headers: {} })),
  ]);

  const r = repoData.data;
  const branch = r.default_branch;

  // Get file tree
  const fileTree = await getFileTree(owner, repo, branch);

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
      const content = await fetchFileContent(owner, repo, path);
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
    const fullPRs = await octokit.pulls.list({
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
    },
    languages: languagesData.data as Record<string, number>,
    fileTree,
    keyFiles,
    recentCommits,
    openPRs,
  };
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
  const { data } = await octokit.repos.listForAuthenticatedUser({
    sort: "updated",
    per_page: perPage,
    page,
  });

  return data.map((r) => ({
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
