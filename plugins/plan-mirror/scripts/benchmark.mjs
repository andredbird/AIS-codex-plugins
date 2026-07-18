#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { evaluateMvp, scoreBenchmark } from '../src/benchmark.mjs';
import { parseArgs } from '../src/util.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.input) {
  process.stderr.write('Usage: benchmark.mjs --input benchmark.json [--output score.json]\n');
  process.exitCode = 1;
} else {
  const dataset = JSON.parse(await readFile(path.resolve(args.input), 'utf8'));
  const score = scoreBenchmark(dataset);
  const result = { ...score, mvp: evaluateMvp(dataset, score) };
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (args.output) await writeFile(path.resolve(args.output), json, { mode: 0o600 });
  else process.stdout.write(json);
}
