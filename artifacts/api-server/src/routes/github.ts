import { Router, type IRouter } from "express";
import { listUserRepos, fetchRepoSnapshot, parseGitHubUrl } from "../services/github.js";

const router: IRouter = Router();

// List authenticated user's GitHub repos
router.get("/github/repos", async (req, res): Promise<void> => {
  try {
    const page = parseInt(String(req.query.page ?? "1"), 10);
    const perPage = Math.min(parseInt(String(req.query.per_page ?? "50"), 10), 100);
    const repos = await listUserRepos(page, perPage);
    res.json(repos);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "GitHub API error";
    res.status(502).json({ error: msg });
  }
});

// Preview a repo before adding it as a project
router.get("/github/preview", async (req, res): Promise<void> => {
  const url = String(req.query.url ?? "");
  if (!url) {
    res.status(400).json({ error: "url query param required" });
    return;
  }
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    res.status(400).json({ error: "Invalid GitHub URL" });
    return;
  }
  try {
    const { metadata } = await fetchRepoSnapshot(parsed.owner, parsed.repo);
    res.json({
      name: parsed.repo,
      url,
      description: metadata.description,
      language: metadata.language,
      stars: metadata.stars,
      topics: metadata.topics,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "GitHub API error";
    res.status(502).json({ error: msg });
  }
});

export default router;
