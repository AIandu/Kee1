---
name: OpenAI model selection
description: Selected OpenAI model and API compatibility requirements for Kee
---

Kee uses OpenAI gpt-5.6-luna for council analysis, Flippa package generation, and the backend project chat route. Newer-model calls use max_completion_tokens rather than max_tokens.

**Why:** The prior gpt-4o configuration hit the organization token-per-minute limit during multi-role repository analysis.

**How to apply:** Keep the model centralized, preserve evidence-governance prompts and structured parsing, and validate one real analysis before reprocessing the portfolio.