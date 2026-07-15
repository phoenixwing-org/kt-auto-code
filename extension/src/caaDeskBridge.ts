export type KtcDeskConnectionStatus = "online" | "offline" | "incompatible";

export type KtcDeskConnection = {
  readonly status: KtcDeskConnectionStatus;
  readonly text: string;
  readonly endpoint: string;
};

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export function ktcCaaHealthEndpoint(openEndpoint: string): string {
  const url = new URL(openEndpoint);
  url.pathname = "/api/caa/health";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function timeoutSignal(timeoutMs: number): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, dispose: () => clearTimeout(timer) };
}

export async function ktcProbeDeskTools(
  openEndpoint: string,
  fetcher: FetchLike = fetch,
  timeoutMs = 1200,
): Promise<KtcDeskConnection> {
  let healthEndpoint: string;
  try {
    healthEndpoint = ktcCaaHealthEndpoint(openEndpoint);
  } catch {
    return { status: "incompatible", text: "接口地址无效", endpoint: openEndpoint };
  }
  const timeout = timeoutSignal(timeoutMs);
  try {
    const response = await fetcher(healthEndpoint, { signal: timeout.signal });
    if (!response.ok) {
      return { status: "incompatible", text: `服务响应异常（HTTP ${response.status}）`, endpoint: openEndpoint };
    }
    const payload = await response.json().catch(() => null) as { ok?: unknown; service?: unknown; protocol_version?: unknown } | null;
    if (payload?.ok !== true || payload.service !== "caa" || payload.protocol_version !== 1) {
      return { status: "incompatible", text: "端口已响应，但不是兼容的 Desk Tools CAA 服务", endpoint: openEndpoint };
    }
    return { status: "online", text: "Desk Tools 已连接", endpoint: openEndpoint };
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "连接超时" : "Desk Tools 未启动或不可连接";
    return { status: "offline", text: reason, endpoint: openEndpoint };
  } finally {
    timeout.dispose();
  }
}

export async function ktcSubmitCaaDialog(
  endpoint: string,
  payload: { workspaceRoot?: string; file: string },
  fetcher: FetchLike = fetch,
  timeoutMs = 3000,
): Promise<void> {
  const timeout = timeoutSignal(timeoutMs);
  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: timeout.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Desk Tools 拒绝打开请求（${response.status}）${detail ? `：${detail}` : ""}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Desk Tools 拒绝")) throw error;
    const detail = error instanceof Error && error.name === "AbortError"
      ? "连接超时"
      : error instanceof Error ? error.message : String(error);
    throw new Error(`无法连接 Desk Tools：${detail}`);
  } finally {
    timeout.dispose();
  }
}
