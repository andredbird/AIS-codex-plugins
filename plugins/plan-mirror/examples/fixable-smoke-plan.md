# Plan Mirror fixable smoke plan

Scope:
- In scope: add an index of the two smoke-plan examples to the Plan Mirror README.
- Out of scope: source code, schemas, dependencies, and marketplace metadata.

### TASK-001 — Add the smoke-plan example index

Requirements: REQ-001

Depends on: none

Files/interfaces:
- `plugins/plan-mirror/README.md`, command-line documentation only.
- `plugins/plan-mirror/examples/smoke-plan.md`, link target only.
- `plugins/plan-mirror/examples/fixable-smoke-plan.md`, link target only.

Implementation:
- Add a “Smoke-plan examples” subsection to the README.
- Add one relative Markdown link to each named example file.
- Give each link a one-sentence description; do not change either example file.

Verification:
- Read the new subsection.

Expected result:
- The documentation looks correct.

Done when:
- The README update seems complete.
