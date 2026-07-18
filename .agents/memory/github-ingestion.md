---
name: GitHub ingestion
description: How Kee fetches and prepares repo data for AI Council analysis
---

## Flow
1. Parse GitHub URL → owner/repo
2. Parallel fetch: repo metadata, languages, commits (last 20), PRs
3. Get full recursive file tree (up to 500 files)
4. Score files by priority patterns (README, package.json, entry points, etc.)
5. Skip binaries, minified files, node_modules, dist/
6. Fetch up to 12 files: 8 priority-matched + 4 non-test source files
7. Cap each file at 8000 chars

## Blind vs documented mode
- Blind: omit repo name and description from context, show only stats and code
- Documented: full context including name, description, topics

**Why:** Blind mode proves Kee can infer purpose from code alone, not metadata.

## Background analysis pattern
- POST /projects/:id/analyze → immediate 202 response
- Background async IIFE runs the full council
- Task row tracks status: queued → running → completed/failed
- Project status: pending → analyzing → analyzed
- Frontend polls every 5s while project.status === 'analyzing'
