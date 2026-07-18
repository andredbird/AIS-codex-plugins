import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PLUGIN_ROOT, tomlString } from './util.mjs';

export class ModelCallBudget {
  constructor(limit) {
    this.limit = limit;
    this.calls = [];
  }

  reserve(role) {
    if (this.calls.length >= this.limit) throw new Error(`Model call budget exhausted before ${role}.`);
    const call = { role, started_at: new Date().toISOString() };
    this.calls.push(call);
    return call;
  }
}

export class MalformedResponseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MalformedResponseError';
  }
}

async function spawnCodex(args, prompt, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn('codex', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
    child.stdin.end(prompt);
  });
}

function parseEvents(stdout) {
  const events = [];
  for (const line of stdout.split('\n').filter(Boolean)) {
    try { events.push(JSON.parse(line)); } catch { /* captured in raw output */ }
  }
  return events;
}

export async function runCodex({ role, prompt, schema, config, budget, snapshot = null, audit = null }) {
  const call = budget.reserve(role);
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'plan-mirror-exec-'));
  const output = path.join(cwd, 'last-message.json');
  const args = [
    'exec', '-', '--ephemeral', '--json', '--sandbox', 'read-only', '--ignore-user-config', '--ignore-rules',
    '--skip-git-repo-check', '--output-schema', schema, '--output-last-message', output,
    '--model', config.review_model, '--config', `model_reasoning_effort=${tomlString(config.reasoning_effort)}`,
    '--config', 'approval_policy="never"',
    '--config', 'features.shell_tool=false', '--config', 'web_search="disabled"', '--cd', cwd
  ];
  if (snapshot) {
    const broker = path.join(PLUGIN_ROOT, 'src', 'evidence-mcp.mjs');
    const brokerArgs = [broker, '--snapshot', snapshot, '--audit', audit, '--max-requests', String(config.max_evidence_requests), '--max-bytes', String(config.max_evidence_bytes)];
    args.push(
      '--config', `mcp_servers.plan_mirror_evidence.command=${tomlString(process.execPath)}`,
      '--config', `mcp_servers.plan_mirror_evidence.args=${JSON.stringify(brokerArgs)}`,
      '--config', 'mcp_servers.plan_mirror_evidence.required=true',
      '--config', 'mcp_servers.plan_mirror_evidence.default_tools_approval_mode="approve"',
      '--config', 'mcp_servers.plan_mirror_evidence.enabled_tools=["list_tree","search","read_range","get_metadata"]'
    );
  }

  try {
    const started = performance.now();
    const processResult = await spawnCodex(args, prompt, cwd);
    const durationMs = Math.round(performance.now() - started);
    const events = parseEvents(processResult.stdout);
    const forbidden = events.filter((event) => {
      const type = event.item?.type ?? event.type;
      return ['command_execution', 'file_change', 'web_search'].includes(type);
    });
    const usageEvent = [...events].reverse().find((event) => event.type === 'turn.completed');
    Object.assign(call, { duration_ms: durationMs, exit_code: processResult.code, usage: usageEvent?.usage ?? null, forbidden_tool_events: forbidden.length });

    if (processResult.code !== 0) {
      throw new Error(`${role} failed (exit ${processResult.code}).\nSTDERR:\n${processResult.stderr.slice(-4000)}\nSTDOUT:\n${processResult.stdout.slice(-4000)}`);
    }
    if (forbidden.length) throw new Error(`${role} emitted forbidden tool events.`);
    let raw;
    try { raw = await readFile(output, 'utf8'); } catch { throw new MalformedResponseError(`${role} produced no structured final message.`); }
    try { return { value: JSON.parse(raw), call }; } catch { throw new MalformedResponseError(`${role} produced malformed JSON.`); }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

export async function runWithMalformedRetry(options, validate) {
  try {
    const result = await runCodex(options);
    try { validate(result.value); }
    catch (error) { throw new MalformedResponseError(error.message); }
    return result;
  } catch (firstError) {
    if (!(firstError instanceof MalformedResponseError)) throw firstError;
    const correction = [
      options.prompt,
      '',
      '<malformed_response_correction>',
      `Your previous response was rejected by local validation: ${firstError.message}`,
      'Produce the complete structured response again. Correct the stated format problem and preserve every original requirement.',
      '</malformed_response_correction>'
    ].join('\n');
    const retry = await runCodex({ ...options, prompt: correction, role: `${options.role}-malformed-retry` });
    try { validate(retry.value); }
    catch (error) { throw new MalformedResponseError(error.message); }
    return retry;
  }
}
