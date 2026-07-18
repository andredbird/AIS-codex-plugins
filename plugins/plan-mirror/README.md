# Plan Mirror Practical

Plan Mirror performs an evidence-bounded technical-plan review:

```text
confirmed contract -> fresh Critic -> one Fixer -> fresh blind Critic
```

It supports plan-only and repo-aware review. Repo-aware mode copies allowed regular text files into a private immutable snapshot and exposes only `list_tree`, `search`, `read_range`, and `get_metadata` through a read-only stdio MCP server. Reviewer runs disable shell and web search and ignore user configuration and rules.

## Requirements

- Node.js 20 or newer
- authenticated `codex` CLI with `codex exec`
- an explicit model ID in config or `PLAN_MIRROR_MODEL`

Copy `config.example.json` to `.plan-mirror.json` in the project being reviewed and replace `explicit-model-id`, or export `PLAN_MIRROR_MODEL`. The controller auto-loads `.plan-mirror.json` from the current workspace.

Add the public marketplace with `codex plugin marketplace add andredbird/AIS-codex-plugins --ref v0.1.0`. For local development, use the absolute repository path instead. The marketplace marks Plan Mirror `INSTALLED_BY_DEFAULT`; restart the desktop app and use a new chat after adding the marketplace or changing the plugin. No normal manual **Install** step is required.

Run preflight:

```bash
node /absolute/path/to/plan-mirror/scripts/plan-mirror.mjs doctor
```

Run a plan-only review:

```bash
node /absolute/path/to/plan-mirror/scripts/plan-mirror.mjs review --plan PLAN.md --contract project-contract.json
```

Run a repository-aware review:

```bash
node /absolute/path/to/plan-mirror/scripts/plan-mirror.mjs review \
  --plan PLAN.md \
  --contract project-contract.json \
  --repo . \
  --scope src,tests
```

Keep the shell working directory at the project being reviewed. This is where `.plan-mirror.json` is discovered and where the default `.plan-mirror/runs/` output is written.

Artifacts are written under `.plan-mirror/runs/` by default: `candidate.md`, `report.md`, and `result.json`. The original plan is hash-checked after the run and is never written by the controller.

`keep_report=false` keeps only those final artifacts. Set it to `true` to retain the initial Critic response and evidence audit logs under `diagnostics/`; those files can contain project details and should not be committed.

## MVP boundaries

- exactly one optional Fixer cycle;
- no panel, strict mode, resume, or automatic candidate application;
- contract extraction/confirmation is coordinated by the skill before the controller runs;
- benchmark harness and implementation-verification reviews are later phases;
- a successful status means only that no blocking findings were found within the recorded contract, snapshot, evidence reads, exclusions, and rubric.
