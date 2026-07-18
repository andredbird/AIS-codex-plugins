import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contractEnvelope, normativeIds } from '../src/contract.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

test('canonical contract hash is independent of object key order', () => {
  const a = {
    schema_version: 1, revision: 1,
    goal: { id: 'GOAL-001', text: 'Ship safely' },
    requirements: [{ text: 'Keep source intact', id: 'REQ-001', provenance: 'user' }],
    success_criteria: [], constraints: [], out_of_scope: [], decisions: []
  };
  const b = {
    decisions: [], out_of_scope: [], constraints: [], success_criteria: [],
    requirements: [{ provenance: 'user', id: 'REQ-001', text: 'Keep source intact' }],
    goal: { text: 'Ship safely', id: 'GOAL-001' }, revision: 1, schema_version: 1
  };
  assert.equal(contractEnvelope(a).hash, contractEnvelope(b).hash);
});

test('missing item IDs are assigned stable collection IDs', () => {
  const { contract } = contractEnvelope({
    schema_version: 1, revision: 2, goal: { text: 'Goal' },
    requirements: ['One', 'Two'], success_criteria: ['Done'], constraints: ['Safe'], out_of_scope: [], decisions: []
  });
  assert.deepEqual(normativeIds(contract), ['REQ-001', 'REQ-002', 'SC-001', 'CON-001']);
});

test('duplicate contract IDs are rejected', () => {
  assert.throws(() => contractEnvelope({
    schema_version: 1, revision: 1, goal: { id: 'GOAL-001', text: 'Goal' },
    requirements: [{ id: 'REQ-001', text: 'One' }, { id: 'REQ-001', text: 'Two' }],
    success_criteria: [], constraints: [], out_of_scope: [], decisions: []
  }), /Duplicate contract ID/);
});

test('critic rubric distinguishes plan omissions from unavailable evidence', async () => {
  const rubric = await readFile(path.join(here, '..', 'prompts', 'review-rubric.md'), 'utf8');
  assert.match(rubric, /required plan detail that is absent.*is `contradicted`/s);
  assert.match(rubric, /Never put `RISK-\*` IDs there/);
});

test('repo-aware critic instructions require an audited evidence read', async () => {
  const critic = await readFile(path.join(here, '..', 'prompts', 'critic.md'), 'utf8');
  assert.match(critic, /perform enough relevant evidence-broker reads/);
  assert.match(critic, /cite real evidence_ids/);
  assert.match(critic, /use `search` or `read_range`/);
});
