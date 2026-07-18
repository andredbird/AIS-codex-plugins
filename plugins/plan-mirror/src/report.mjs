export function renderReport(result) {
  const lines = [
    '# Plan Mirror report', '',
    `Status: **${result.status}**`, '',
    `Repository verification: **${result.repository_verification}**`, '',
    '## Integrity', '',
    `- Contract SHA-256: \`${result.hashes.contract}\``,
    `- Source plan SHA-256: \`${result.hashes.source_plan}\``,
    `- Candidate SHA-256: \`${result.hashes.candidate}\``,
    `- Snapshot SHA-256: ${result.hashes.snapshot ? `\`${result.hashes.snapshot}\`` : 'not performed'}`,
    `- Source plan unchanged: ${result.source_plan_unchanged ? 'yes' : 'NO'}`, '',
    '## Scope and isolation', '',
    `- Fresh critic processes: ${result.isolation.fresh_critic_processes}`,
    `- Fixer received repository access: ${result.isolation.fixer_repository_access ? 'yes' : 'no'}`,
    `- Final critic received prior findings: ${result.isolation.final_critic_received_prior_findings ? 'yes' : 'no'}`,
    `- Shell enabled for reviewers: ${result.isolation.shell_enabled ? 'yes' : 'no'}`,
    `- Web enabled for reviewers: ${result.isolation.web_enabled ? 'yes' : 'no'}`, '',
    '## Initial blockers and revision', ''
  ];
  if (!result.initial_blockers.length) lines.push('No initial blockers.');
  for (const finding of result.initial_blockers) lines.push(`- ${finding.id} (${finding.severity}): ${finding.problem}`);
  if (result.fixer) lines.push(`- Fixer addressed: ${result.fixer.addresses.join(', ')}`);
  lines.push('',
    '## Final findings', ''
  );
  if (!result.final_review.findings.length) lines.push('No findings.');
  for (const finding of result.final_review.findings) {
    lines.push(`### ${finding.id} — ${finding.severity}`, '', finding.problem, '', `Minimal fix: ${finding.minimal_fix}`, '');
  }
  lines.push('## Coverage', '', '| Subject | Status | Method |', '|---|---|---|');
  for (const row of result.final_review.coverage) lines.push(`| ${row.subject_id} | ${row.status} | ${row.method} |`);
  lines.push('', '## Limitations and exclusions', '');
  if (!result.incomplete_reasons.length && !result.exclusions.length) lines.push('- None recorded.');
  for (const reason of result.incomplete_reasons) lines.push(`- ${reason}`);
  for (const item of result.exclusions.slice(0, 200)) lines.push(`- ${item.path}: ${item.reason}`);
  if (result.exclusions.length > 200) lines.push(`- ${result.exclusions.length - 200} additional exclusions are in result.json.`);
  lines.push('', '## Runtime', '',
    `- Model calls: ${result.runtime.model_calls}`,
    `- Input tokens: ${result.runtime.tokens.input_tokens}`,
    `- Cached input tokens: ${result.runtime.tokens.cached_input_tokens}`,
    `- Output tokens: ${result.runtime.tokens.output_tokens}`,
    `- Reasoning output tokens: ${result.runtime.tokens.reasoning_output_tokens}`,
    `- Duration: ${result.runtime.duration_ms} ms`
  );
  if (result.status.startsWith('NO_BLOCKERS')) {
    lines.push('', '> Within the specified contract, snapshot, and review rubric, no blocking findings were found.');
  }
  return `${lines.join('\n')}\n`;
}
