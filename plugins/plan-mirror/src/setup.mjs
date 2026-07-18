import { lstat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assert, canonicalJson } from './util.mjs';

const CONFIG_NAME = '.plan-mirror.json';
const GITIGNORE_NAME = '.gitignore';
const REQUIRED_IGNORES = Object.freeze(['.plan-mirror/', '.plan-mirror.json']);

async function fileKind(file) {
  try {
    const info = await lstat(file);
    assert(!info.isSymbolicLink(), `${path.basename(file)} must not be a symbolic link.`);
    assert(info.isFile(), `${path.basename(file)} must be a regular file.`);
    return 'file';
  } catch (error) {
    if (error.code === 'ENOENT') return 'missing';
    throw error;
  }
}

function validateModel(model) {
  assert(typeof model === 'string' && model.trim(), 'setup requires an explicit --model value.');
  const normalized = model.trim();
  assert(normalized !== 'explicit-model-id', 'Replace explicit-model-id with a real model ID.');
  assert(!/[\r\n]/.test(normalized), 'Model ID must be a single line.');
  return normalized;
}

async function ensureConfig(root, model, kind) {
  const file = path.join(root, CONFIG_NAME);
  if (kind === 'missing') {
    await writeFile(file, canonicalJson({ review_model: model }), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    return { action: 'created', file };
  }

  let config;
  try { config = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { throw new Error(`${CONFIG_NAME} is not valid JSON: ${error.message}`); }
  assert(config && typeof config === 'object' && !Array.isArray(config), `${CONFIG_NAME} must contain a JSON object.`);

  if (config.review_model && config.review_model !== 'explicit-model-id') {
    assert(config.review_model === model, `${CONFIG_NAME} already sets review_model to ${JSON.stringify(config.review_model)}; refusing to replace it with ${JSON.stringify(model)}.`);
    return { action: 'unchanged', file };
  }

  await writeFile(file, canonicalJson({ ...config, review_model: model }), { encoding: 'utf8', mode: 0o600 });
  return { action: 'updated', file };
}

async function ensureGitignore(root, kind) {
  const file = path.join(root, GITIGNORE_NAME);
  const original = kind === 'file' ? await readFile(file, 'utf8') : '';
  const present = new Set(original.split(/\r?\n/).map((line) => line.trim()));
  const added = REQUIRED_IGNORES.filter((entry) => !present.has(entry));

  if (added.length === 0) return { action: 'unchanged', file, added };

  let next = original;
  if (next && !next.endsWith('\n')) next += '\n';
  next += `${added.join('\n')}\n`;
  await writeFile(file, next, { encoding: 'utf8', mode: 0o644, flag: kind === 'missing' ? 'wx' : 'w' });
  return { action: kind === 'missing' ? 'created' : 'updated', file, added };
}

export async function setupWorkspace({ root = process.cwd(), model }) {
  const resolvedRoot = path.resolve(root);
  const normalizedModel = validateModel(model);
  const [configKind, gitignoreKind] = await Promise.all([
    fileKind(path.join(resolvedRoot, CONFIG_NAME)),
    fileKind(path.join(resolvedRoot, GITIGNORE_NAME))
  ]);
  const config = await ensureConfig(resolvedRoot, normalizedModel, configKind);
  const gitignore = await ensureGitignore(resolvedRoot, gitignoreKind);
  return { root: resolvedRoot, model: normalizedModel, config, gitignore };
}
