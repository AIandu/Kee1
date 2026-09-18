---
name: OpenAI rate limits
description: Token-budget constraints for the repository council
---

The repository council can hit the organization token-per-minute limit even when the API key has available credits. Large shared repository context multiplied across parallel roles plus the governor causes 429 rate_limit_exceeded responses.

**Why:** A valid key returned a 30,000 TPM limit error while the old UI incorrectly described it as depleted credits.

**How to apply:** Keep council calls serialized or tightly bounded, use conservative output budgets and retry-after backoff, and distinguish token rate limits from insufficient quota and invalid-key failures.