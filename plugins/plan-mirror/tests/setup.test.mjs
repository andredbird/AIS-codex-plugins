import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setupWorkspace } from '../src/setup.mjs';

async function workspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'plan-mirror-setup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('setup creates project config and privacy ignores', async (t) => {
  const root = await workspace(t);
  const result = await setupWorkspace({ root, model: 'gpt-test' });

  assert.equal(result.config.action, 'created');
  assert.equal(result.gitignore.action, 'created');
  assert.deepEqual(JSON.parse(await readFile(path.join(root, '.plan-mirror.json'), 'utf8')), { review_model: 'gpt-test' });
  assert.equal(await readFile(path.join(root, '.gitignore'), 'utf8'), '.plan-mirror/\n.plan-mirror.json\n');
});

test('setup preserves existing config values and gitignore entries', async (t) => {
  const root = await workspace(t);
  await writeFile(path.join(root, '.plan-mirror.json'), '{\n  "keep_report": true\n}\n');
  await writeFile(path.join(root, '.gitignore'), 'node_modules/\n.plan-mirror/\n');

  const result = await setupWorkspace({ root, model: 'gpt-test' });
  const config = JSON.parse(await readFile(path.join(root, '.plan-mirror.json'), 'utf8'));
  const gitignore = await readFile(path.join(root, '.gitignore'), 'utf8');

  assert.deepEqual(config, { keep_report: true, review_model: 'gpt-test' });
  assert.equal(result.config.action, 'updated');
  assert.deepEqual(result.gitignore.added, ['.plan-mirror.json']);
  assert.equal(gitignore, 'node_modules/\n.plan-mirror/\n.plan-mirror.json\n');
});

test('setup is idempotent', async (t) => {
  const root = await workspace(t);
  await setupWorkspace({ root, model: 'gpt-test' });
  const result = await setupWorkspace({ root, model: 'gpt-test' });

  assert.equal(result.config.action, 'unchanged');
  assert.equal(result.gitignore.action, 'unchanged');
});

test('setup refuses to replace an existing model', async (t) => {
  const root = await workspace(t);
  await writeFile(path.join(root, '.plan-mirror.json'), '{"review_model":"gpt-existing"}\n');

  await assert.rejects(
    setupWorkspace({ root, model: 'gpt-other' }),
    /refusing to replace it/
  );
  assert.equal(JSON.parse(await readFile(path.join(root, '.plan-mirror.json'), 'utf8')).review_model, 'gpt-existing');
});

test('setup rejects placeholders and multiline model IDs', async (t) => {
  const root = await workspace(t);
  await assert.rejects(setupWorkspace({ root, model: 'explicit-model-id' }), /real model ID/);
  await assert.rejects(setupWorkspace({ root, model: 'gpt-test\nother' }), /single line/);
});

test('setup replaces the documented placeholder after confirmation', async (t) => {
  const root = await workspace(t);
  await writeFile(path.join(root, '.plan-mirror.json'), '{"review_model":"explicit-model-id","keep_report":false}\n');

  const result = await setupWorkspace({ root, model: 'gpt-test' });
  const config = JSON.parse(await readFile(path.join(root, '.plan-mirror.json'), 'utf8'));

  assert.equal(result.config.action, 'updated');
  assert.deepEqual(config, { keep_report: false, review_model: 'gpt-test' });
});

test('setup rejects symlinked project settings before writing', async (t) => {
  const root = await workspace(t);
  const outside = path.join(root, 'outside');
  await writeFile(outside, 'do not modify\n');
  await symlink(outside, path.join(root, '.gitignore'));

  await assert.rejects(setupWorkspace({ root, model: 'gpt-test' }), /must not be a symbolic link/);
  await assert.rejects(readFile(path.join(root, '.plan-mirror.json')), { code: 'ENOENT' });
  assert.equal(await readFile(outside, 'utf8'), 'do not modify\n');
});
