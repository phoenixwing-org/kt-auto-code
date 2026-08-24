/** Compares two validated Git selections without trusting their display order. */
export function KtcSameGitOidSelection(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) return false;
  const leftSet = new Set(left);
  if (leftSet.size !== left.length) return false;
  return right.every((oid) => leftSet.has(oid));
}
