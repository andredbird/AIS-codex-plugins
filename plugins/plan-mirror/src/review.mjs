import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { contractEnvelope } from './contract.mjs';
import { ModelCallBudget, runCodex, runWithMalformedRetry } from './codex-runner.mjs';
import { renderReport } from './report.mjs';
import { createSnapshot, SnapshotLimitError } from './snapshot.mjs';
import { PLUGIN_ROOT, nowId, readJson, sha256, writeJson, assert } from './util.mjs';
import { assessReview, validateCandidate, validateFixerShape, validateReviewShape, RISK_IDS } from './validation.mjs';
import { blockingFindings, computeVerdict } from './verdict.mjs';

async function readText(file, limit, label) {
  const bytes = await readFile(file);
  assert(bytes.length <= limit, `${label} exceeds configured size limit.`);
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), bytes }; }
  catch { throw new Error(`${label} must be valid UTF-8.`); }
}

function criticPrompt({ critic, rubric, contract, plan, repoAware }) {
  const normativeSubjects = [...contract.requirements, ...contract.success_criteria, ...contract.constraints].map((item) => item.id);
  const subjects = normativeSubjects.concat(RISK_IDS);
  return [
    critic,
    rubric,
    `Repository verification: ${repoAware ? 'available only through plan_mirror_evidence MCP tools' : 'not_performed; no repository tools exist'}.`,
    `Required coverage subjects: ${subjects.join(', ')}`,
    `Allowed finding normative_ids: ${normativeSubjects.join(', ') || '(none)'}. RISK-* IDs are coverage subjects, not normative IDs.`,
    '<confirmed_contract_json>', JSON.stringify(contract, null, 2), '</confirmed_contract_json>',
    '<candidate_plan_markdown>', plan, '</candidate_plan_markdown>'
  ].join('\n\n');
}

function fixerPrompt({ instructions, contract, plan, planHash, blockers }) {
  return [
    instructions,
    `Exact base plan SHA-256: ${planHash}`,
    '<confirmed_contract_json>', JSON.stringify(contract, null, 2), '</confirmed_contract_json>',
    '<current_plan_markdown>', plan, '</current_plan_markdown>',
    '<current_blocking_findings_json>', JSON.stringify(blockers, null, 2), '</current_blocking_findings_json>'
  ].join('\n\n');
}

function partialReview(summary) {
  return { summary, coverage: [], findings: [] };
}

function totalUsage(calls) {
  const totals = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 };
  for (const call of calls) for (const key of Object.keys(totals)) totals[key] += Number(call.usage?.[key] ?? 0);
  return totals;
}

export async function runReview({ planFile, contractFile, repo = null, scope = [], outDir = null, config }) {
  const started = performance.now();
  const planPath = path.resolve(planFile);
  const contractPath = path.resolve(contractFile);
  const basePlanInput = await readText(planPath, config.plan_size_limit, 'Plan');
  const basePlan = basePlanInput.text;
  const sourcePlanHash = sha256(basePlanInput.bytes);
  const { contract, hash: contractHash } = contractEnvelope(await readJson(contractPath));
  const outputRoot = path.resolve(outDir ?? path.join(process.cwd(), '.plan-mirror', 'runs', nowId()));
  assert(outputRoot !== planPath, 'Output directory cannot be the source plan path.');
  await mkdir(outputRoot, { recursive: true, mode: 0o700 });

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'plan-mirror-run-'));
  const snapshotPath = repo ? path.join(tempRoot, 'snapshot') : null;
  const budget = new ModelCallBudget(config.max_model_calls);
  let snapshot = null;
  let exclusions = [];
  let firstReview = null;
  let finalReview = null;
  let assessment = { complete: false, incomplete_reasons: [] };
  let candidate = basePlan;
  let fixerResult = null;
  let status = 'INCOMPLETE';
  let firstAudit = null;
  let finalAudit = null;

  try {
    if (repo) {
      try {
        snapshot = await createSnapshot({ repo, destination: snapshotPath, scope, config });
        exclusions = snapshot.exclusions;
      } catch (error) {
        if (!(error instanceof SnapshotLimitError)) throw error;
        exclusions = error.exclusions;
        assessment = { complete: false, incomplete_reasons: [error.message] };
        finalReview = partialReview(error.message);
      }
    }

    if (!finalReview) {
      const [critic, rubric, fixerInstructions] = await Promise.all([
        readFile(path.join(PLUGIN_ROOT, 'prompts', 'critic.md'), 'utf8'),
        readFile(path.join(PLUGIN_ROOT, 'prompts', 'review-rubric.md'), 'utf8'),
        readFile(path.join(PLUGIN_ROOT, 'prompts', 'fixer.md'), 'utf8')
      ]);
      firstAudit = repo ? path.join(tempRoot, 'critic-1-audit.jsonl') : null;
      const first = await runWithMalformedRetry({
        role: 'critic-1',
        prompt: criticPrompt({ critic, rubric, contract, plan: basePlan, repoAware: Boolean(repo) }),
        schema: path.join(PLUGIN_ROOT, 'schemas', 'review-schema.json'), config, budget,
        snapshot: snapshotPath, audit: firstAudit
      }, validateReviewShape);
      firstReview = first.value;
      const firstAssessment = await assessReview({ review: firstReview, contract, repoAware: Boolean(repo), audit: firstAudit });
      const firstVerdict = computeVerdict({ review: firstReview, assessment: firstAssessment, threshold: config.blocking_threshold });
      finalReview = firstReview;
      assessment = firstAssessment;
      status = firstVerdict;

      const fixable = blockingFindings(firstReview, 'major').filter((finding) => !finding.requires_user_decision);
      if (firstVerdict === 'ACTION_REQUIRED' && fixable.length) {
        const fixed = await runCodex({
          role: 'fixer',
          prompt: fixerPrompt({ instructions: fixerInstructions, contract, plan: basePlan, planHash: sourcePlanHash, blockers: fixable }),
          schema: path.join(PLUGIN_ROOT, 'schemas', 'fixer-schema.json'), config, budget
        });
        validateFixerShape(fixed.value);
        candidate = validateCandidate({ fixer: fixed.value, basePlan, basePlanHash: sourcePlanHash, contract, config, blockerIds: fixable.map((finding) => finding.id) });
        fixerResult = { addresses: fixed.value.addresses, base_plan_hash: fixed.value.base_plan_hash };

        finalAudit = repo ? path.join(tempRoot, 'critic-2-audit.jsonl') : null;
        const blind = await runWithMalformedRetry({
          role: 'critic-2',
          prompt: criticPrompt({ critic, rubric, contract, plan: candidate, repoAware: Boolean(repo) }),
          schema: path.join(PLUGIN_ROOT, 'schemas', 'review-schema.json'), config, budget,
          snapshot: snapshotPath, audit: finalAudit
        }, validateReviewShape);
        finalReview = blind.value;
        assessment = await assessReview({ review: finalReview, contract, repoAware: Boolean(repo), audit: finalAudit });
        status = computeVerdict({ review: finalReview, assessment, threshold: config.blocking_threshold });
      }
    }

    const currentPlanHash = sha256((await readText(planPath, config.plan_size_limit, 'Source plan after review')).bytes);
    const sourcePlanUnchanged = currentPlanHash === sourcePlanHash;
    if (!sourcePlanUnchanged) {
      status = 'INCOMPLETE';
      assessment.incomplete_reasons = [...(assessment.incomplete_reasons ?? []), 'source plan changed during review'];
    }

    const result = {
      schema_version: 1,
      status,
      repository_verification: repo ? 'performed_on_immutable_snapshot' : 'not_performed',
      hashes: { contract: contractHash, source_plan: sourcePlanHash, candidate: sha256(candidate), snapshot: snapshot?.root_hash ?? null },
      contract_revision: contract.revision,
      source_plan_unchanged: sourcePlanUnchanged,
      initial_blockers: firstReview ? blockingFindings(firstReview, 'major') : [],
      fixer: fixerResult,
      final_review: finalReview ?? partialReview('Review did not complete.'),
      incomplete_reasons: assessment.incomplete_reasons ?? [],
      exclusions,
      isolation: {
        fresh_critic_processes: budget.calls.filter((call) => call.role.startsWith('critic')).length,
        fixer_repository_access: false,
        final_critic_received_prior_findings: false,
        shell_enabled: false,
        web_enabled: false,
        user_config_loaded: false,
        user_rules_loaded: false
      },
      runtime: {
        model_calls: budget.calls.length,
        calls: budget.calls,
        tokens: totalUsage(budget.calls),
        duration_ms: Math.round(performance.now() - started)
      },
      diagnostics_retained: Boolean(config.keep_report)
    };
    await writeFile(path.join(outputRoot, 'candidate.md'), candidate, { encoding: 'utf8', mode: 0o600 });
    await writeJson(path.join(outputRoot, 'result.json'), result);
    await writeFile(path.join(outputRoot, 'report.md'), renderReport(result), { encoding: 'utf8', mode: 0o600 });
    if (config.keep_report) {
      const diagnostics = path.join(outputRoot, 'diagnostics');
      await mkdir(diagnostics, { recursive: true, mode: 0o700 });
      if (firstReview) await writeJson(path.join(diagnostics, 'initial-review.json'), firstReview);
      for (const [source, name] of [[firstAudit, 'critic-1-audit.jsonl'], [finalAudit, 'critic-2-audit.jsonl']]) {
        if (!source) continue;
        try { await writeFile(path.join(diagnostics, name), await readFile(source), { mode: 0o600 }); } catch { /* no evidence reads */ }
      }
    }
    return { result, outputRoot };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
