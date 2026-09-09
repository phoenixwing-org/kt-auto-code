export interface ExtensionHostSmokeReceiptValidationOptions {
  readonly requireCad?: boolean;
}

export function validateExtensionHostSmokeReceipt(
  receipt: unknown,
  options?: ExtensionHostSmokeReceiptValidationOptions,
): string[];
