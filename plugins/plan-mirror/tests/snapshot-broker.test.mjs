import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSnapshot } from '../src/snapshot.mjs';
import { EvidenceBroker } from '../src/evidence-broker.mjs';

const config = { max_file_bytes: 1024, max_files: 20, repo_snapshot_limit: 4096 };

test('snapshot copies only scoped regular UTF-8 files and preserves source', async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'pm-snapshot-test-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const repo = path.join(temp, 'repo');
  const snapshot = path.join(temp, 'snapshot');
  await mkdir(path.join(repo, 'src'), { recursive: true });
  await writeFile(path.join(repo, 'src', 'app.txt'), 'before\nneedle\n');
  await writeFile(path.join(repo, 'src', '.env'), 'TOKEN=secret\n');
  await writeFile(path.join(repo, 'src', 'binary.bin'), Buffer.from([0, 1, 2]));
  await symlink(path.join(repo, 'src', 'app.txt'), path.join(repo, 'src', 'link.txt'));
  await writeFile(path.join(repo, 'outside.txt'), 'outside\n');

  const manifest = await createSnapshot({ repo, destination: snapshot, scope: ['src'], config });
  assert.deepEqual(manifest.files.map((item) => item.path), ['src/app.txt']);
  assert.equal(await readFile(path.join(repo, 'src', 'app.txt'), 'utf8'), 'before\nneedle\n');
  assert.ok(manifest.exclusions.some((item) => item.reason === 'secret-pattern'));
  assert.ok(manifest.exclusions.some((item) => item.reason === 'binary-or-invalid-utf8'));
  assert.ok(manifest.exclusions.some((item) => item.reason === 'symlink'));

  const audit = path.join(temp, 'audit.jsonl');
  const broker = await new EvidenceBroker({ snapshot, audit, maxRequests: 10, maxBytes: 1024 }).initialize();
  const match = await broker.search({ query: 'needle' });
  assert.match(match.evidence_id, /^ev-[a-f0-9]{16}$/);
  const range = await broker.readRange({ path: 'src/app.txt', start_line: 2, end_line: 2 });
  assert.equal(range.text, '2: needle');
  await assert.rejects(() => broker.readRange({ path: '../repo/src/app.txt' }), /traversal/);
});

test('unsafe scope is rejected', async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'pm-scope-test-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  await assert.rejects(() => createSnapshot({ repo: temp, destination: path.join(temp, 'snap'), scope: ['../'], config }), /Unsafe scope/);
});
