import { readFile } from 'node:fs/promises';
import { normativeIds } from './contract.mjs';
import { assert, sha256 } from './util.mjs';

export const RISK_IDS = [
  'RISK-ARCHITECTURE', 'RISK-DEPENDENCIES', 'RISK-DATA', 'RISK-CONCURRENCY',
  'RISK-OPERATIONS', 'RISK-VERIFICATION', 'RISK-SCOPE', 'RISK-EXECUTION'
];

const STATUSES = new Set(['supported', 'contradicted', 'insufficient_evidence', 'not_applicable']);
const SEVERITIES = new Set(['critical', 'major', 'minor', 'nit']);

export function validateReviewShape(review) {
  assert(review && typeof review.summary === 'string', 'Malformed review response: summary.');
  assert(Array.isArray(review.coverage), 'Malformed review response: coverage.');
  assert(Array.isArray(review.findings), 'Malformed review response: findings.');
  for (const row of review.coverage) {
    assert(typeof row.subject_id === 'string' && STATUSES.has(row.status), 'Malformed coverage row.');
    assert(Array.isArray(row.evidence_refs), 'Malformed coverage evidence_refs.');
  }
  for (const finding of review.findings) {
    assert(/^finding-\d{3,}$/.test(finding.id) && SEVERITIES.has(finding.severity), 'Malformed finding.');
    assert(Array.isArray(finding.normative_ids) && Array.isArray(finding.evidence_refs), 'Malformed finding references.');
    assert(typeof finding.requires_user_decision === 'boolean', 'Malformed finding decision flag.');
  }
}

export async function readAuditIds(audit) {
  if (!audit) return { ids: new Set(), entries: [] };
  let raw = '';
  try { raw = await readFile(audit, 'utf8'); } catch { return { ids: new Set(), entries: [] }; }
  const entries = raw.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  return { ids: new Set(entries.map((entry) => entry.evidence_id)), entries };
}

export async function assessReview({ review, contract, repoAware, audit }) {
  validateReviewShape(review);
  const expected = [...normativeIds(contract), ...RISK_IDS];
  const seen = new Map();
  const reasons = [];
  for (const row of review.coverage) {
    if (seen.has(row.subject_id)) reasons.push(`duplicate coverage: ${row.subject_id}`);
    seen.set(row.subject_id, row);
    if (row.status === 'not_applicable' && !RISK_IDS.includes(row.subject_id)) reasons.push(`not_applicable used for normative item: ${row.subject_id}`);
    if (row.status === 'insufficient_evidence') reasons.push(`insufficient evidence: ${row.subject_id}`);
  }
  for (const id of expected) if (!seen.has(id)) reasons.push(`missing coverage: ${id}`);
  for (const id of seen.keys()) if (!expected.includes(id)) reasons.push(`unexpected coverage: ${id}`);
  if (review.coverage.some((row) => row.status === 'contradicted') && review.findings.length === 0) reasons.push('contradicted coverage has no finding');

  const { ids: evidenceIds, entries } = await readAuditIds(audit);
  const refs = review.coverage.flatMap((row) => row.evidence_refs).concat(review.findings.flatMap((finding) => finding.evidence_refs));
  if (!repoAware && refs.length) reasons.push('plan-only response cited repository evidence');
  if (repoAware) {
    if (entries.length === 0) reasons.push('repository verification performed no evidence reads');
    for (const ref of refs) if (!evidenceIds.has(ref)) reasons.push(`unknown evidence ref: ${ref}`);
    for (const row of review.coverage) if (row.method === 'repo-check' && row.evidence_refs.length === 0) reasons.push(`repo-check has no evidence ref: ${row.subject_id}`);
  }
  if (entries.some((entry) => entry.error)) reasons.push('evidence broker tool failure');

  const contractIds = new Set(normativeIds(contract));
  for (const finding of review.findings) {
    for (const id of finding.normative_ids) if (!contractIds.has(id)) reasons.push(`finding cites unknown normative ID: ${id}`);
  }
  return { complete: reasons.length === 0, incomplete_reasons: [...new Set(reasons)], evidence_entries: entries };
}

export function validateFixerShape(value) {
  assert(value && /^[a-f0-9]{64}$/.test(value.base_plan_hash), 'Malformed Fixer base_plan_hash.');
  assert(Array.isArray(value.addresses) && typeof value.candidate_markdown === 'string', 'Malformed Fixer response.');
}

export function validateCandidate({ fixer, basePlan, basePlanHash = sha256(basePlan), contract, config, blockerIds }) {
  validateFixerShape(fixer);
  assert(fixer.base_plan_hash === basePlanHash, 'Fixer base plan hash mismatch.');
  const candidate = fixer.candidate_markdown;
  assert(Buffer.byteLength(candidate) <= config.plan_size_limit, 'Candidate exceeds plan_size_limit.');
  assert(!candidate.includes('\r'), 'Candidate must use UTF-8/LF line endings.');
  assert(candidate.trim() && candidate !== basePlan, 'Candidate is empty or identical to base plan.');
  for (const id of normativeIds(contract)) assert(candidate.includes(id), `Candidate removed normative ID ${id}.`);
  for (const id of blockerIds) assert(fixer.addresses.includes(id), `Fixer did not address ${id}.`);
  assert(
    /^### TASK-\d{3,} — \S.+$/m.test(candidate),
    'Candidate must contain at least one task heading in the exact format "### TASK-001 — Imperative title".'
  );
  return candidate;
}
