# Andrey Codex plugins

Personal Codex marketplace for reusable, project-independent plugins.

## Plan Mirror

`plan-mirror` reviews a technical plan against a confirmed project contract. It runs a fresh Critic, optionally creates one revised full-plan candidate, and sends that candidate to a second blind Critic. Source plans are never overwritten.

Public installation:

```bash
codex plugin marketplace add andredbird/AIS-codex-plugins --ref v0.1.0
```

Plan Mirror is marked `INSTALLED_BY_DEFAULT`, so after adding the marketplace, restart the ChatGPT desktop app and start a new Codex chat; the normal manual **Install** step is not required. Then use `$plan-mirror:doctor` and `$plan-mirror:review`.

For local development, replace the GitHub source with the absolute path to this repository.

The marketplace contains reusable prompts, schemas, controller code, and synthetic fixtures only. Do not commit real contracts, plan outputs, snapshots, logs, secrets, or personal data.

See [plugins/plan-mirror/README.md](plugins/plan-mirror/README.md) for runtime details and current MVP boundaries.
