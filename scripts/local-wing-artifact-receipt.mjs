/** Internal-test provenance only. Never accepted as Registry release evidence. */
export function verifyLocalWingReceipt(receipt, expected) {
  if (receipt?.schemaVersion !== 1 || receipt.kind !== "kt.auto-code.local-wing-vsix"
    || receipt.publishable !== false || typeof receipt.wingRoot !== "string" || !receipt.wingRoot.trim()
    || receipt.version !== expected.version || receipt.artifact !== expected.artifact
    || receipt.sha256 !== expected.sha256 || receipt.bytes !== expected.bytes) {
    throw new Error("Invalid local Wing receipt: candidate identity/digest mismatch or publishable flag not false");
  }
  return receipt;
}
