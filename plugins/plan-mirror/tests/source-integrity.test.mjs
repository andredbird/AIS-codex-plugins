import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sha256 } from '../src/util.mjs';

test('fixture proves separate candidate writes do not modify source plan', async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'pm-integrity-test-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const plan = path.join(temp, 'PLAN.md');
  const candidate = path.join(temp, 'candidate.md');
  await writeFile(plan, '# Original\nREQ-001\n');
  const before = sha256(await readFile(plan));
  await writeFile(candidate, '# Improved\nREQ-001\n### TASK-001\n');
  const after = sha256(await readFile(plan));
  assert.equal(after, before);
});
