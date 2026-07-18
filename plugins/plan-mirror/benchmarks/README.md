# Benchmark data

Keep benchmark plans and oracle labels outside the plugin repository when they contain project or personal data. Store only anonymized fixtures here.

Create a dataset conforming to `schemas/benchmark-schema.json`. Include the call-matched self-review, fresh Critic, and full-cycle variants, at least two repeats, oracle mappings for findings, residual blockers, regressions, requirement retention, human attention, calls, tokens, duration, and source-plan mutation status.

Score it with:

```bash
node scripts/benchmark.mjs --input /path/to/benchmark.json --output /path/to/score.json
```

The scorer evaluates the MVP gates from the project plan. It does not claim the gates pass until a real corpus contains at least 24 plans, 60 unique known blockers, 6 clean controls, and 2 repeats.
