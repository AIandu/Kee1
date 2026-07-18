---
name: AI Council architecture
description: Role-to-model assignment for Kee's six-member AI Council using user's own API keys
---

## Role assignments
- Researcher → Anthropic claude-sonnet-4-6 (factual, evidence-based)
- Engineering Reviewer → Anthropic claude-opus-4-7 (best for code architecture)
- Product Analyst → OpenAI gpt-4o (product thinking)
- Documentation Specialist → OpenAI gpt-4o (doc quality)
- Market Evaluator → Google gemini-2.0-flash (market research)
- Governor → Anthropic claude-opus-4-7 (synthesis + structured verdict)

## Keys used
User's own keys: OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, GITHUB_TOKEN — NOT Replit AI integrations proxy.
Clients initialized directly: `new OpenAI({ apiKey: process.env.OPENAI_API_KEY })` etc.

**Why:** User explicitly brought their own API keys. Replit proxy skills say "Do NOT proceed with this integration" when user wants their own key.

## Governor output format
Governor produces structured output parsed with regex:
VERDICT / CONFIDENCE / VALUE_SCORE / READINESS_SCORE / OPPORTUNITY_SCORE / ESTIMATED_MARKET_VALUE / ESTIMATED_BUILD_COST / INFERRED_DESCRIPTION / PRIMARY_LANGUAGE / TAGS
All five council members run in parallel, then Governor synthesizes sequentially.

## Services location
- `artifacts/api-server/src/services/github.ts` — GitHub ingestion
- `artifacts/api-server/src/services/council.ts` — AI Council runner
