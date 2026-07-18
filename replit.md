# Kee — Cognitive Software Asset Intelligence System

A private intelligence environment for Loretta Chapman that ingests, analyzes, and monetizes software assets through autonomous, evidence-based cognitive processing.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/kee run dev` — run the Kee frontend (port 22118, preview at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + TanStack Query + wouter + framer-motion
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle schema (projects, analyses, vault, audit, tasks)
- `artifacts/api-server/src/routes/` — Express route handlers (projects, analyses, vault, audit, tasks, dashboard)
- `artifacts/kee/src/` — React frontend (pages, components, shell/sidebar)
- `attached_assets/1783969794751_1784416923551.png` — Kee avatar image (aliased as `@assets`)

## Architecture decisions

- **OpenAPI-first:** All API contracts defined in `lib/api-spec/openapi.yaml` before implementation. Zod schemas auto-generated for server validation; React Query hooks auto-generated for frontend.
- **Truth classification:** Analysis findings carry `confidence_level` (confirmed/inferred/unknown) and must pass Governor approval before use in investor materials.
- **Blind scan mode:** Projects can be analyzed in `blind` mode (no docs/metadata) to prove deep code understanding, or `documented` mode.
- **Audit trail:** Every automated change is recorded in `audit_logs` with before/after/reason/agent. All pending entries require user approval.
- **Kee avatar:** Image at `attached_assets/1783969794751_1784416923551.png`, imported via `@assets` alias in Vite config.

## Product

- **Daily Companion** (`/`) — Personalized greeting, activity feed, Private Idea Studio quick-capture
- **Portfolio Dashboard** (`/dashboard`) — Projects ranked by value/readiness/opportunity scores
- **Project Deep-Dive** (`/projects/:id`) — AI Council analyses, Governor controls, relationship graph
- **Master Vault** (`/vault`) — Searchable archive of notes, documents, ideas, decisions
- **Change Audit** (`/audit`) — Full change log with approve/reject governance
- **Task Queue** (`/tasks`) — Autonomous task monitoring and approval
- **AI Council** (`/council`) — Six council roles: Researcher, Engineering Reviewer, Product Analyst, Documentation Specialist, Market Evaluator, Governor

## User preferences

- Creator: Loretta Chapman
- Theme: White, gold (#C9A84C), lilac (#B39DDB)
- No emojis anywhere in the UI
- Privacy-first: no external training, no public access

## Gotchas

- After any schema change in `lib/db/`, run `pnpm --filter @workspace/db run push` then `pnpm run typecheck:libs`
- After any OpenAPI spec change, run `pnpm --filter @workspace/api-spec run codegen` before touching route or frontend code
- The `@assets` Vite alias points to the workspace root `attached_assets/` directory

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
