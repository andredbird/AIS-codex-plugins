import { canonicalJson, sha256, assert } from './util.mjs';

const COLLECTIONS = [
  ['requirements', 'REQ'],
  ['success_criteria', 'SC'],
  ['constraints', 'CON'],
  ['out_of_scope', 'OOS'],
  ['decisions', 'DEC']
];

function normalizeItem(item, prefix, index) {
  const value = typeof item === 'string' ? { text: item } : { ...item };
  value.id ??= `${prefix}-${String(index + 1).padStart(3, '0')}`;
  assert(new RegExp(`^${prefix}-\\d{3,}$`).test(value.id), `Invalid stable ID ${value.id}.`);
  assert(typeof value.text === 'string' && value.text.trim(), `${value.id} must have non-empty text.`);
  value.text = value.text.trim();
  return value;
}

export function normalizeContract(input) {
  const contract = structuredClone(input);
  assert(contract.schema_version === 1, 'contract.schema_version must be 1.');
  assert(Number.isInteger(contract.revision) && contract.revision >= 1, 'contract.revision must be a positive integer.');
  assert(contract.goal && typeof contract.goal.text === 'string' && contract.goal.text.trim(), 'contract.goal.text is required.');
  contract.goal = { ...contract.goal, id: contract.goal.id ?? 'GOAL-001', text: contract.goal.text.trim() };
  assert(/^GOAL-\d{3,}$/.test(contract.goal.id), 'contract.goal.id must be a stable GOAL ID.');

  const ids = new Set([contract.goal.id]);
  for (const [key, prefix] of COLLECTIONS) {
    contract[key] = (contract[key] ?? []).map((item, index) => normalizeItem(item, prefix, index));
    for (const item of contract[key]) {
      assert(!ids.has(item.id), `Duplicate contract ID ${item.id}.`);
      ids.add(item.id);
    }
  }
  assert(contract.requirements.length > 0, 'Contract must contain at least one requirement.');
  return contract;
}

export function contractEnvelope(input) {
  const contract = normalizeContract(input);
  const canonical = canonicalJson(contract);
  return { contract, canonical, hash: sha256(canonical) };
}

export function normativeIds(contract) {
  return COLLECTIONS.slice(0, 3).flatMap(([key]) => contract[key].map((item) => item.id));
}
