---
name: Evidence-first analysis
description: Rules for repository analysis, valuation, and sale-readiness claims
---

Repository analysis must treat executable/configuration files as the primary evidence. README prose can document the project but cannot prove runtime behavior or what the software does. Unsupported business facts, scores, valuations, and buyer claims must be explicitly marked UNKNOWN rather than filled with plausible defaults, and every technical claim needs an exact file citation.

**Why:** Repository metadata and model-generated narrative previously produced confident claims and an unsupported aggregate valuation.

**How to apply:** Block analysis when repository contents are inaccessible, keep VERIFIED/INFERRED/UNKNOWN separate, and preserve estimates as estimates with the evidence basis visible.