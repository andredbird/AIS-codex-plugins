import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMvp, scoreBenchmark } from '../src/benchmark.mjs';

test('benchmark scorer computes recall, precision, safety, and MVP gates', () => {
  const dataset = {
    schema_version: 1, repeats: 1,
    variants: { call_matched_self: 'A', fresh_critic: 'B', full_cycle: 'C' },
    cases: [
      {
        id: 'case-1', clean_control: false, known_blocker_ids: ['b1', 'b2'],
        runs: [
          { variant: 'A', repeat: 1, findings: [], residual_blockers: 2, regressions: 0, requirement_retention: 1, human_attention_minutes: 1, calls: 1, tokens: 10, duration_ms: 10, source_plan_changed: false },
          { variant: 'B', repeat: 1, findings: [{ severity: 'major', oracle_id: 'b1' }], residual_blockers: 1, regressions: 0, requirement_retention: 1, human_attention_minutes: 1, calls: 1, tokens: 10, duration_ms: 10, source_plan_changed: false },
          { variant: 'C', repeat: 1, findings: [{ severity: 'major', oracle_id: 'b1' }, { severity: 'major', oracle_id: 'b2' }], residual_blockers: 0, regressions: 0, requirement_retention: 1, human_attention_minutes: 1, calls: 3, tokens: 30, duration_ms: 30, source_plan_changed: false }
        ]
      }
    ]
  };
  const score = scoreBenchmark(dataset);
  assert.equal(score.variants.B.blocker_recall, 0.5);
  assert.equal(score.variants.C.blocker_precision, 1);
  assert.equal(score.variants.A.unsafe_pass_rate, 1);
  const mvp = evaluateMvp(dataset, score);
  assert.equal(mvp.passed, false);
  assert.equal(mvp.checks.fresh_recall_gain_10pp, true);
  assert.equal(mvp.checks.no_source_plan_changes, true);
});
