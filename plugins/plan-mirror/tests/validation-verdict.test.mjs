import test from 'node:test';
import assert from 'node:assert/strict';
import { contractEnvelope } from '../src/contract.mjs';
import { assessReview, RISK_IDS, validateCandidate } from '../src/validation.mjs';
import { computeVerdict } from '../src/verdict.mjs';
import { sha256 } from '../src/util.mjs';

const contract = contractEnvelope({
  schema_version: 1, revision: 1, goal: { id: 'GOAL-001', text: 'Goal' },
  requirements: [{ id: 'REQ-001', text: 'Requirement' }],
  success_criteria: [], constraints: [], out_of_scope: [], decisions: []
}).contract;

function cleanReview() {
  return {
    summary: 'clean', findings: [],
    coverage: ['REQ-001', ...RISK_IDS].map((subject_id) => ({ subject_id, status: 'supported', method: 'plan-check', rationale: 'covered', evidence_refs: [] }))
  };
}

test('controller computes clean and incomplete verdicts', async () => {
  const clean = cleanReview();
  const assessment = await assessReview({ review: clean, contract, repoAware: false, audit: null });
  assert.equal(computeVerdict({ review: clean, assessment }), 'NO_BLOCKERS_FOUND_WITHIN_SCOPE');
  clean.coverage.pop();
  const incomplete = await assessReview({ review: clean, contract, repoAware: false, audit: null });
  assert.equal(computeVerdict({ review: clean, assessment: incomplete }), 'INCOMPLETE');
});

test('decision takes priority over blockers', async () => {
  const review = cleanReview();
  review.findings.push({
    id: 'finding-001', severity: 'major', category: 'scope', normative_ids: ['REQ-001'], plan_location: 'TASK-001',
    evidence_refs: [], problem: 'ambiguous', causal_mechanism: 'choice missing', minimal_fix: 'decide', confidence: 'high', requires_user_decision: true
  });
  const assessment = await assessReview({ review, contract, repoAware: false, audit: null });
  assert.equal(computeVerdict({ review, assessment }), 'DECISION_REQUIRED');
});

test('candidate validator rejects requirement loss and accepts full candidate', () => {
  const basePlan = '# Plan\nREQ-001\n';
  const fixer = {
    base_plan_hash: sha256(basePlan), addresses: ['finding-001'],
    candidate_markdown: '# Plan\nREQ-001\n### TASK-001 — Work\nVerification: test\n'
  };
  assert.equal(validateCandidate({ fixer, basePlan, contract, config: { plan_size_limit: 4096 }, blockerIds: ['finding-001'] }), fixer.candidate_markdown);
  assert.throws(() => validateCandidate({ fixer: { ...fixer, candidate_markdown: '### TASK-001 — Work\n' }, basePlan, contract, config: { plan_size_limit: 4096 }, blockerIds: ['finding-001'] }), /removed normative ID/);
});
