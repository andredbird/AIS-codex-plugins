import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/config.mjs';
import { runReview } from '../src/review.mjs';

test('controller runs critic, one fixer, and a blind critic without changing source', async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'pm-controller-test-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const plan = path.join(temp, 'PLAN.md');
  const contract = path.join(temp, 'contract.json');
  const output = path.join(temp, 'output');
  const source = '# Base plan\n\nREQ-001\n';
  await writeFile(plan, source);
  await writeFile(contract, JSON.stringify({
    schema_version: 1, revision: 1, goal: { id: 'GOAL-001', text: 'Goal' },
    requirements: [{ id: 'REQ-001', text: 'Requirement' }],
    success_criteria: [], constraints: [], out_of_scope: [], decisions: []
  }));
  const fakeBin = fileURLToPath(new URL('./fixtures/bin', import.meta.url));
  await chmod(path.join(fakeBin, 'codex'), 0o755);
  const priorPath = process.env.PATH;
  process.env.PATH = `${fakeBin}${path.delimiter}${priorPath}`;
  t.after(() => { process.env.PATH = priorPath; });

  const { result } = await runReview({
    planFile: plan, contractFile: contract, outDir: output,
    config: { ...DEFAULT_CONFIG, review_model: 'mock-model' }
  });
  assert.equal(result.status, 'NO_BLOCKERS_FOUND_WITHIN_SCOPE');
  assert.equal(result.runtime.model_calls, 3);
  assert.equal(result.isolation.fresh_critic_processes, 2);
  assert.deepEqual(result.fixer.addresses, ['finding-001']);
  assert.equal(await readFile(plan, 'utf8'), source);
  assert.match(await readFile(path.join(output, 'candidate.md'), 'utf8'), /### TASK-001/);
});
