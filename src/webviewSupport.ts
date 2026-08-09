import { randomBytes } from "node:crypto";

interface KtcWebviewSecuritySource {
  cspSource: string;
}

interface KtcWebviewSecurityOptions {
  allowImages?: boolean;
}

export interface KtcWebviewSecurity {
  nonce: string;
  csp: string;
}

export function ktcCreateWebviewSecurity(
  webview: KtcWebviewSecuritySource,
  options: KtcWebviewSecurityOptions = {},
): KtcWebviewSecurity {
  const nonce = randomBytes(24).toString("base64url");
  const directives = ["default-src 'none'"];
  if (options.allowImages) directives.push(`img-src ${webview.cspSource} data:`);
  directives.push(
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  );
  return { nonce, csp: directives.join("; ") };
}
