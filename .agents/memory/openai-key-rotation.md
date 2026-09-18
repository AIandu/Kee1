---
name: OpenAI key rotation
description: Runtime behavior for the direct OpenAI client used by analysis
---

The direct OpenAI client must be created when an analysis request starts, not only when the API module loads. Rotating the OPENAI_API_KEY secret otherwise leaves a running workflow holding the previous key until restart.

**Why:** A key can be updated while the workflow is still running, and stale module-level clients make a valid replacement appear unusable.

**How to apply:** Read the current environment value at request time, restart the API workflow after a secret rotation, and keep invalid-key, quota/rate-limit, and repository-data errors distinct.