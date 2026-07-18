import { spawn } from 'node:child_process';
import { access, chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EvidenceBroker } from './evidence-broker.mjs';
import { ModelCallBudget, runCodex } from './codex-runner.mjs';
import { PLUGIN_ROOT, canonicalJson, sha256 } from './util.mjs';

function check(name, ok, detail, mandatory = true) { return { name, ok: Boolean(ok), mandatory, detail }; }

function commandResult(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => resolve({ ok: false, stdout, detail: `${error.code ?? 'spawn-error'}: ${error.message}` }));
    child.on('close', (status) => resolve({ ok: status === 0, stdout, detail: (stdout || stderr).trim().slice(-1000) }));
  });
}

export async function runDoctor({ config, live = false }) {
  const checks = [];
  const major = Number(process.versions.node.split('.')[0]);
  checks.push(check('node', major >= 20, `Node ${process.versions.node}; requires >=20`));

  const codexVersion = await commandResult('codex', ['--version']);
  checks.push(check('codex_cli', codexVersion.ok, codexVersion.detail));
  const helpResult = await commandResult('codex', ['exec', '--help']);
  const help = helpResult.stdout;
  for (const flag of ['--ephemeral', '--json', '--sandbox', '--ignore-user-config', '--ignore-rules', '--output-schema']) {
    checks.push(check(`codex_exec_${flag.slice(2).replaceAll('-', '_')}`, help.includes(flag), flag));
  }
  const auth = await commandResult('codex', ['login', '-c', 'service_tier="fast"', 'status']);
  checks.push(check('authentication', auth.ok, auth.detail));
  checks.push(check('review_model', config?.review_model && config.review_model !== 'explicit-model-id', config?.review_model ?? 'not configured'));

  for (const schema of ['contract-schema.json', 'review-schema.json', 'fixer-schema.json', 'doctor-schema.json']) {
    try { JSON.parse(await readFile(path.join(PLUGIN_ROOT, 'schemas', schema), 'utf8')); checks.push(check(`schema_${schema}`, true, 'valid JSON')); }
    catch (error) { checks.push(check(`schema_${schema}`, false, error.message)); }
  }

  const temp = await mkdtemp(path.join(os.tmpdir(), 'plan-mirror-doctor-'));
  const snapshot = path.join(temp, 'snapshot');
  const audit = path.join(temp, 'audit.jsonl');
  try {
    await mkdir(snapshot, { mode: 0o700 });
    const content = 'doctor evidence\n';
    await writeFile(path.join(snapshot, 'sample.txt'), content, { mode: 0o400 });
    await writeFile(path.join(snapshot, '.plan-mirror-manifest.json'), canonicalJson({ schema_version: 1, root_hash: sha256(content), scope: [], files: [{ path: 'sample.txt', bytes: Buffer.byteLength(content), sha256: sha256(content), lines: 2 }], exclusions: [], total_bytes: Buffer.byteLength(content), file_count: 1 }), { mode: 0o400 });
    await chmod(snapshot, 0o500);
    const mode = (await stat(path.join(snapshot, 'sample.txt'))).mode & 0o777;
    checks.push(check('private_temp', ((await stat(temp)).mode & 0o077) === 0, temp));
    checks.push(check('immutable_snapshot_files', mode === 0o400, `mode ${mode.toString(8)}`));
    const broker = await new EvidenceBroker({ snapshot, audit, maxRequests: 5, maxBytes: 1024 }).initialize();
    const evidence = await broker.readRange({ path: 'sample.txt', start_line: 1, end_line: 1 });
    checks.push(check('evidence_broker', /^ev-[a-f0-9]{16}$/.test(evidence.evidence_id), evidence.evidence_id));
    let traversalBlocked = false;
    try { await broker.readRange({ path: '../sample.txt' }); } catch { traversalBlocked = true; }
    checks.push(check('path_traversal', traversalBlocked, traversalBlocked ? 'blocked' : 'NOT blocked'));
  } catch (error) {
    checks.push(check('evidence_broker', false, error.message));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
  try { await access(temp); checks.push(check('temp_cleanup', false, 'temporary directory remains')); }
  catch { checks.push(check('temp_cleanup', true, 'removed')); }
  const gitVersion = await commandResult('git', ['--version']);
  checks.push(check('git', gitVersion.ok, gitVersion.detail));
  checks.push(check('snapshot_limits', config?.repo_snapshot_limit > 0 && config?.max_files > 0, `${config?.max_files ?? 0} files / ${config?.repo_snapshot_limit ?? 0} bytes`));

  if (live && config?.review_model) {
    try {
      const budget = new ModelCallBudget(1);
      const probe = await runCodex({ role: 'doctor-live', prompt: 'Return {"ok":true}. Do not use tools.', schema: path.join(PLUGIN_ROOT, 'schemas', 'doctor-schema.json'), config, budget });
      checks.push(check('live_structured_sandbox_probe', probe.value?.ok === true && probe.call.forbidden_tool_events === 0, 'model call completed', true));
    } catch (error) { checks.push(check('live_structured_sandbox_probe', false, error.message, true)); }
  } else checks.push(check('live_structured_sandbox_probe', true, 'not requested (no model call)', false));

  return { ok: checks.every((item) => !item.mandatory || item.ok), checks };
}
