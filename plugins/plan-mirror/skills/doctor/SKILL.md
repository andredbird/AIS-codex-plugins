---
name: doctor
description: Diagnose and, with explicit user confirmation, initialize Plan Mirror runtime and safety prerequisites. Use when the user invokes $plan-mirror:doctor, before a first plan review, or when Codex execution, authentication, project configuration, schemas, sandboxing, snapshot cleanup, or the evidence broker fails.
---

# Diagnose Plan Mirror

Preserve the current project workspace as the working directory. Resolve `<plugin-root>` as the directory two levels above this `SKILL.md`, then run by absolute path. Do not `cd` into the plugin:

```bash
node <plugin-root>/scripts/plan-mirror.mjs doctor
```

Use `--json` for machine-readable output. Use `--live` only when the user explicitly wants a billable model/authentication probe; the default doctor is local and makes no model call.

Resolve the model from `PLAN_MIRROR_MODEL`, workspace `.plan-mirror.json`, an explicit user choice, or the top-level `model` in the current user's global Codex `config.toml`. Read that global setting only to propose the model; never modify it. If no unambiguous model is available, ask the user to choose one. Never use `explicit-model-id`.

If the only failed mandatory check is `review_model`, offer one safe initialization:

1. Show the exact proposed model and changes: create or update `.plan-mirror.json`, and add `.plan-mirror/` plus `.plan-mirror.json` to `.gitignore`.
2. Ask for explicit confirmation. Do not infer approval from invoking Doctor or from silence.
3. After confirmation, preserve the workspace as the working directory and run:

```bash
node <plugin-root>/scripts/plan-mirror.mjs setup --model <confirmed-model-id>
```

The setup command preserves existing configuration values, adds only missing ignore entries, is idempotent, and refuses to replace a different existing model. If it reports a conflict or invalid file, show the problem and stop instead of overwriting anything.

After successful setup, rerun Doctor locally and report the final result. Never run `--live` unless the user separately requests the billable probe.

Report every failed mandatory check and do not start review while any mandatory check fails. Distinguish local capability checks from the optional live probe. Recommend the narrowest corrective action; never weaken sandboxing or enable shell/web to make the check pass.
