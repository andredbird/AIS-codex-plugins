import path from 'node:path';
import { readJson, assert } from './util.mjs';

export const DEFAULT_CONFIG = Object.freeze({
  review_model: null,
  reasoning_effort: 'high',
  blocking_threshold: 'major',
  max_revisions: 1,
  max_model_calls: 4,
  plan_size_limit: 65_536,
  repo_snapshot_limit: 134_217_728,
  keep_report: false,
  max_files: 20_000,
  max_evidence_requests: 150,
  max_evidence_bytes: 4_194_304,
  max_file_bytes: 1_048_576
});

export async function loadConfig(file, env = process.env) {
  let user = {};
  if (file) user = await readJson(path.resolve(file));
  else {
    try { user = await readJson(path.resolve('.plan-mirror.json')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const config = { ...DEFAULT_CONFIG, ...user };
  if (env.PLAN_MIRROR_MODEL) config.review_model = env.PLAN_MIRROR_MODEL;

  assert(config.review_model && config.review_model !== 'explicit-model-id', 'Set review_model in config or PLAN_MIRROR_MODEL.');
  assert(['minimal', 'low', 'medium', 'high', 'xhigh'].includes(config.reasoning_effort), 'Invalid reasoning_effort.');
  assert(['critical', 'major', 'minor', 'nit'].includes(config.blocking_threshold), 'Invalid blocking_threshold.');
  assert(config.max_revisions === 1, 'MVP requires max_revisions=1.');
  assert(config.max_model_calls === 4, 'MVP requires max_model_calls=4.');
  for (const key of ['plan_size_limit', 'repo_snapshot_limit', 'max_files', 'max_evidence_requests', 'max_evidence_bytes', 'max_file_bytes']) {
    assert(Number.isInteger(config[key]) && config[key] > 0, `${key} must be a positive integer.`);
  }
  return config;
}
