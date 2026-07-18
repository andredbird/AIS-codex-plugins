const BLOCKING = new Set(['critical', 'major']);

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : null;
}

export function scoreBenchmark(dataset) {
  if (dataset?.schema_version !== 1 || !Array.isArray(dataset.cases)) throw new Error('Invalid benchmark dataset.');
  const variants = new Map();
  for (const item of dataset.cases) {
    const known = new Set(item.known_blocker_ids ?? []);
    for (const run of item.runs ?? []) {
      const score = variants.get(run.variant) ?? {
        runs: 0, known_blockers: 0, true_positives: 0, false_positives: 0,
        unsafe_passes: 0, blocker_cases: 0, clean_false_blocks: 0, clean_runs: 0,
        residual_blockers: 0, regressions: 0, requirement_retention_sum: 0,
        human_attention_minutes: 0, calls: 0, tokens: 0, duration_ms: 0, source_plan_changes: 0
      };
      const blockingFindings = run.findings.filter((finding) => BLOCKING.has(finding.severity));
      const matched = new Set(blockingFindings.map((finding) => finding.oracle_id).filter((id) => id && known.has(id)));
      score.runs += 1;
      score.known_blockers += known.size;
      score.true_positives += matched.size;
      score.false_positives += blockingFindings.filter((finding) => !finding.oracle_id || !known.has(finding.oracle_id)).length;
      if (known.size) {
        score.blocker_cases += 1;
        if (matched.size === 0) score.unsafe_passes += 1;
      }
      if (item.clean_control) {
        score.clean_runs += 1;
        if (blockingFindings.length) score.clean_false_blocks += 1;
      }
      score.residual_blockers += run.residual_blockers;
      score.regressions += run.regressions;
      score.requirement_retention_sum += run.requirement_retention;
      score.human_attention_minutes += run.human_attention_minutes;
      score.calls += run.calls;
      score.tokens += run.tokens;
      score.duration_ms += run.duration_ms;
      score.source_plan_changes += run.source_plan_changed ? 1 : 0;
      variants.set(run.variant, score);
    }
  }
  const output = {};
  for (const [name, score] of variants) {
    output[name] = {
      ...score,
      blocker_recall: ratio(score.true_positives, score.known_blockers),
      blocker_precision: ratio(score.true_positives, score.true_positives + score.false_positives),
      unsafe_pass_rate: ratio(score.unsafe_passes, score.blocker_cases),
      clean_plan_false_block_rate: ratio(score.clean_false_blocks, score.clean_runs),
      requirement_retention: ratio(score.requirement_retention_sum, score.runs)
    };
    delete output[name].requirement_retention_sum;
  }
  return { schema_version: 1, case_count: dataset.cases.length, clean_controls: dataset.cases.filter((item) => item.clean_control).length, known_blockers: dataset.cases.reduce((sum, item) => sum + item.known_blocker_ids.length, 0), repeats: dataset.repeats, variants: output };
}

export function evaluateMvp(dataset, score) {
  const self = score.variants[dataset.variants.call_matched_self];
  const fresh = score.variants[dataset.variants.fresh_critic];
  const cycle = score.variants[dataset.variants.full_cycle];
  if (!self || !fresh || !cycle) throw new Error('Configured benchmark variants are missing runs.');
  const residualReduction = fresh.residual_blockers ? (fresh.residual_blockers - cycle.residual_blockers) / fresh.residual_blockers : null;
  const checks = {
    at_least_24_plans: score.case_count >= 24,
    at_least_60_known_blockers: score.known_blockers >= 60,
    at_least_6_clean_controls: score.clean_controls >= 6,
    at_least_2_repeats: score.repeats >= 2,
    fresh_recall_gain_10pp: fresh.blocker_recall !== null && self.blocker_recall !== null && fresh.blocker_recall - self.blocker_recall >= 0.10,
    cycle_residual_reduction_20pct: residualReduction !== null && residualReduction >= 0.20,
    cycle_precision_75pct: cycle.blocker_precision !== null && cycle.blocker_precision >= 0.75,
    call_budget_matched: self.runs > 0 && cycle.runs > 0 && self.calls / self.runs === cycle.calls / cycle.runs,
    no_source_plan_changes: Object.values(score.variants).every((variant) => variant.source_plan_changes === 0)
  };
  return { passed: Object.values(checks).every(Boolean), checks, residual_blocker_reduction: residualReduction };
}
