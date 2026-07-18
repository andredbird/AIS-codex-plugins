const ORDER = { critical: 0, major: 1, minor: 2, nit: 3 };

export function blockingFindings(review, threshold = 'major') {
  return review.findings.filter((finding) => ORDER[finding.severity] <= ORDER[threshold]);
}

export function computeVerdict({ review, assessment, threshold = 'major' }) {
  if (!assessment.complete) return 'INCOMPLETE';
  if (review.findings.some((finding) => finding.requires_user_decision)) return 'DECISION_REQUIRED';
  if (blockingFindings(review, threshold).length) return 'ACTION_REQUIRED';
  if (review.findings.length) return 'NO_BLOCKERS_FOUND_WITH_NOTES';
  return 'NO_BLOCKERS_FOUND_WITHIN_SCOPE';
}
