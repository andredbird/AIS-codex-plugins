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

test('controller retries a Fixer candidate with a malformed TASK heading', async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'pm-fixer-retry-test-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const plan = path.join(temp, 'PLAN.md');
  const contract = path.join(temp, 'contract.json');
  const output = path.join(temp, 'output');
  const stateFile = path.join(temp, 'fixer-calls');
  const source = '# Base plan\n\nREQ-001\n';
  await writeFile(plan, source);
  await writeFile(contract, JSON.stringify({
    schema_version: 1, revision: 1, goal: { id: 'GOAL-001', text: 'Goal' },
    requirements: [{ id: 'REQ-001', text: 'Requirement' }],
    success_criteria: [], constraints: [], out_of_scope: [], decisions: []
  }));
  const fakeBin = fileURLToPath(new URL('./fixtures/bin', import.meta.url));
  await chmod(path.join(fakeBin, 'codex'), 0o755);
  const prior = {
    path: process.env.PATH,
    mode: process.env.PLAN_MIRROR_FAKE_FIXER_MODE,
    state: process.env.PLAN_MIRROR_FAKE_STATE_FILE
  };
  process.env.PATH = `${fakeBin}${path.delimiter}${prior.path}`;
  process.env.PLAN_MIRROR_FAKE_FIXER_MODE = 'missing-task-once';
  process.env.PLAN_MIRROR_FAKE_STATE_FILE = stateFile;
  t.after(() => {
    process.env.PATH = prior.path;
    if (prior.mode === undefined) delete process.env.PLAN_MIRROR_FAKE_FIXER_MODE;
    else process.env.PLAN_MIRROR_FAKE_FIXER_MODE = prior.mode;
    if (prior.state === undefined) delete process.env.PLAN_MIRROR_FAKE_STATE_FILE;
    else process.env.PLAN_MIRROR_FAKE_STATE_FILE = prior.state;
  });

  const { result } = await runReview({
    planFile: plan, contractFile: contract, outDir: output,
    config: { ...DEFAULT_CONFIG, review_model: 'mock-model' }
  });
  assert.equal(result.status, 'NO_BLOCKERS_FOUND_WITHIN_SCOPE');
  assert.equal(result.runtime.model_calls, 4);
  assert.deepEqual(result.runtime.calls.map((call) => call.role), [
    'critic-1', 'fixer', 'fixer-malformed-retry', 'critic-2'
  ]);
  assert.equal(result.candidate_produced, true);
  assert.match(await readFile(path.join(output, 'candidate.md'), 'utf8'), /^### TASK-001 — /m);
  assert.equal(await readFile(plan, 'utf8'), source);
});

test('controller writes an INCOMPLETE report when both Fixer attempts are invalid', async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'pm-fixer-rejected-test-'));
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
  const priorMode = process.env.PLAN_MIRROR_FAKE_FIXER_MODE;
  process.env.PATH = `${fakeBin}${path.delimiter}${priorPath}`;
  process.env.PLAN_MIRROR_FAKE_FIXER_MODE = 'missing-task-always';
  t.after(() => {
    process.env.PATH = priorPath;
    if (priorMode === undefined) delete process.env.PLAN_MIRROR_FAKE_FIXER_MODE;
    else process.env.PLAN_MIRROR_FAKE_FIXER_MODE = priorMode;
  });

  const { result } = await runReview({
    planFile: plan, contractFile: contract, outDir: output,
    config: { ...DEFAULT_CONFIG, review_model: 'mock-model' }
  });
  assert.equal(result.status, 'INCOMPLETE');
  assert.equal(result.runtime.model_calls, 3);
  assert.equal(result.candidate_produced, false);
  assert.equal(result.hashes.candidate, null);
  assert.match(result.incomplete_reasons.join('\n'), /exact format/);
  assert.match(await readFile(path.join(output, 'report.md'), 'utf8'), /Candidate SHA-256: not produced/);
  assert.match(await readFile(path.join(output, 'result.json'), 'utf8'), /"status": "INCOMPLETE"/);
  await assert.rejects(() => readFile(path.join(output, 'candidate.md')), (error) => error.code === 'ENOENT');
  assert.equal(await readFile(plan, 'utf8'), source);
});
