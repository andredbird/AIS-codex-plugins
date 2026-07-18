---
name: doctor
description: Diagnose Plan Mirror runtime and safety prerequisites. Use when the user invokes $plan-mirror:doctor, before a first plan review, or when Codex execution, authentication, schemas, sandboxing, snapshot cleanup, or the evidence broker fails.
---

# Diagnose Plan Mirror

Preserve the current project workspace as the working directory. Resolve `<plugin-root>` as the directory two levels above this `SKILL.md`, then run by absolute path. Do not `cd` into the plugin:

```bash
node <plugin-root>/scripts/plan-mirror.mjs doctor
```

Use `--json` for machine-readable output. Use `--live` only when the user explicitly wants a billable model/authentication probe; the default doctor is local and makes no model call.

Resolve the model from `PLAN_MIRROR_MODEL`, workspace `.plan-mirror.json`, or `--config <path>`. If none is configured, report it as a required setup item.

Report every failed mandatory check and do not start review while any mandatory check fails. Distinguish local capability checks from the optional live probe. Recommend the narrowest corrective action; never weaken sandboxing or enable shell/web to make the check pass.
