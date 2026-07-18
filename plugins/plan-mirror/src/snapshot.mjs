import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, copyFile, lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { canonicalJson, sha256, assert } from './util.mjs';

const SECRET_NAMES = /(^|\/)(\.env($|\.)|\.npmrc$|\.pypirc$|id_[^/]+$|credentials?(\.|$)|secrets?(\.|$)|.*\.(pem|key|p12|pfx|jks|keystore)$)/i;
const DENY_DIRS = new Set(['.git', 'node_modules', '.plan-mirror', 'coverage', 'dist', 'build']);

export class SnapshotLimitError extends Error {
  constructor(message, exclusions = []) {
    super(message);
    this.name = 'SnapshotLimitError';
    this.exclusions = exclusions;
  }
}

function normalizeScope(scope = []) {
  return scope.filter(Boolean).map((value) => {
    const normalized = path.posix.normalize(value.replaceAll('\\', '/')).replace(/^\.\//, '').replace(/\/$/, '');
    assert(normalized && normalized !== '..' && !normalized.startsWith('../') && !path.posix.isAbsolute(normalized), `Unsafe scope: ${value}`);
    return normalized;
  });
}

function inScope(relative, scope) {
  return scope.length === 0 || scope.some((prefix) => relative === prefix || relative.startsWith(`${prefix}/`));
}

async function walk(root, current = root, output = []) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    if (entry.isDirectory()) {
      if (!DENY_DIRS.has(entry.name)) await walk(root, absolute, output);
    } else output.push(relative);
  }
  return output;
}

async function candidates(repo) {
  try {
    const raw = execFileSync('git', ['-C', repo, 'ls-files', '-co', '--exclude-standard', '-z'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return [...new Set(raw.split('\0').filter(Boolean))].sort();
  } catch {
    return (await walk(repo)).sort();
  }
}

function isText(bytes) {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export async function createSnapshot({ repo, destination, scope = [], config }) {
  const root = path.resolve(repo);
  const selectedScope = normalizeScope(scope);
  const files = [];
  const exclusions = [];
  let totalBytes = 0;
  const aggregate = createHash('sha256');
  await mkdir(destination, { recursive: true, mode: 0o700 });

  for (const relativeRaw of await candidates(root)) {
    const relative = path.posix.normalize(relativeRaw.replaceAll('\\', '/'));
    if (!inScope(relative, selectedScope)) continue;
    if (relative.startsWith('../') || path.posix.isAbsolute(relative)) {
      exclusions.push({ path: relativeRaw, reason: 'unsafe-path' });
      continue;
    }
    if (SECRET_NAMES.test(relative)) {
      exclusions.push({ path: relative, reason: 'secret-pattern' });
      continue;
    }
    const source = path.join(root, ...relative.split('/'));
    let stat;
    try { stat = await lstat(source); } catch { exclusions.push({ path: relative, reason: 'stat-failed' }); continue; }
    if (stat.isSymbolicLink()) { exclusions.push({ path: relative, reason: 'symlink' }); continue; }
    if (!stat.isFile()) { exclusions.push({ path: relative, reason: 'not-regular-file' }); continue; }
    if (stat.size > config.max_file_bytes) { exclusions.push({ path: relative, reason: 'file-too-large', bytes: stat.size }); continue; }
    const bytes = await readFile(source);
    if (!isText(bytes)) { exclusions.push({ path: relative, reason: 'binary-or-invalid-utf8' }); continue; }
    if (files.length + 1 > config.max_files || totalBytes + bytes.length > config.repo_snapshot_limit) {
      throw new SnapshotLimitError('Repository snapshot limits exceeded; narrow --scope.', exclusions);
    }
    const target = path.join(destination, ...relative.split('/'));
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await copyFile(source, target);
    await chmod(target, 0o400);
    const hash = sha256(bytes);
    files.push({ path: relative, bytes: bytes.length, sha256: hash, lines: bytes.length === 0 ? 0 : bytes.toString('utf8').split('\n').length });
    totalBytes += bytes.length;
    aggregate.update(relative).update('\0').update(hash).update('\0');
  }

  const manifest = {
    schema_version: 1,
    root_hash: aggregate.digest('hex'),
    scope: selectedScope,
    files,
    exclusions,
    total_bytes: totalBytes,
    file_count: files.length
  };
  await writeFile(path.join(destination, '.plan-mirror-manifest.json'), canonicalJson(manifest), { mode: 0o400 });
  return manifest;
}
