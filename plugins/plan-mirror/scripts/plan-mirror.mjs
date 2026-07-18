#!/usr/bin/env node
import path from 'node:path';
import { DEFAULT_CONFIG, loadConfig } from '../src/config.mjs';
import { runDoctor } from '../src/doctor.mjs';
import { runReview } from '../src/review.mjs';
import { parseArgs } from '../src/util.mjs';

function usage() {
  return `Plan Mirror Practical\n\nUsage:\n  plan-mirror.mjs doctor [--config FILE] [--json] [--live]\n  plan-mirror.mjs review --plan FILE --contract FILE [--repo DIR] [--scope a,b] [--config FILE] [--out DIR]\n`;
}

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
try {
  if (!command || command === 'help' || args.help) {
    process.stdout.write(usage());
  } else if (command === 'doctor') {
    let config;
    try { config = await loadConfig(args.config); }
    catch { config = { ...DEFAULT_CONFIG, review_model: process.env.PLAN_MIRROR_MODEL ?? null }; }
    const report = await runDoctor({ config, live: Boolean(args.live) });
    if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else {
      for (const item of report.checks) process.stdout.write(`${item.ok ? 'PASS' : item.mandatory ? 'FAIL' : 'SKIP'} ${item.name}: ${item.detail}\n`);
      process.stdout.write(`\n${report.ok ? 'Plan Mirror is ready.' : 'Plan Mirror is not ready.'}\n`);
    }
    process.exitCode = report.ok ? 0 : 2;
  } else if (command === 'review') {
    if (!args.plan || !args.contract) throw new Error('review requires --plan and --contract');
    const config = await loadConfig(args.config);
    const preflight = await runDoctor({ config, live: false });
    if (!preflight.ok) {
      const failures = preflight.checks.filter((item) => item.mandatory && !item.ok).map((item) => `${item.name}: ${item.detail}`);
      throw new Error(`Doctor preflight failed:\n${failures.join('\n')}`);
    }
    const scope = typeof args.scope === 'string' ? args.scope.split(',').map((item) => item.trim()).filter(Boolean) : [];
    const { result, outputRoot } = await runReview({
      planFile: path.resolve(args.plan), contractFile: path.resolve(args.contract),
      repo: args.repo ? path.resolve(args.repo) : null, scope,
      outDir: args.out ? path.resolve(args.out) : null, config
    });
    process.stdout.write(`${result.status}\nArtifacts: ${outputRoot}\n`);
  } else throw new Error(`Unknown command: ${command}`);
} catch (error) {
  process.stderr.write(`Plan Mirror error: ${error.message}\n`);
  process.exitCode = 1;
}
