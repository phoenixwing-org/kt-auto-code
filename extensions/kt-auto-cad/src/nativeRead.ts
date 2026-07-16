import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import {
  pnwIsCadNativeV1Envelope,
  pnwIsCadNativeV1ReadSuccess,
  type PnwCadNativeV1ReadResponse,
  type PnwCadNativeV1Success,
  type PnwCadNativeV1FcstdDocument,
} from "@phoenix-wing/cad-contracts";

const execFileAsync = promisify(execFile);
const READ_TIMEOUT_MS = 30_000;
const READ_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

export type KtcCadReadSuccess = PnwCadNativeV1Success<PnwCadNativeV1FcstdDocument>;

export interface KtcCadNativeExecutor {
  (
    binaryPath: string,
    args: readonly string[],
    options: Readonly<Record<string, unknown>>,
  ): Promise<{ stdout: string; stderr: string }>;
}

const defaultExecutor: KtcCadNativeExecutor = async (binaryPath, args, options) => {
  const result = await execFileAsync(binaryPath, [...args], options);
  return { stdout: String(result.stdout), stderr: String(result.stderr) };
};

export async function readFcstdWithNativeV1(
  binaryPath: string,
  fcstdPath: string,
  executor: KtcCadNativeExecutor = defaultExecutor,
): Promise<KtcCadReadSuccess> {
  if (!path.isAbsolute(binaryPath)) throw new Error("fcstd-read 路径必须是绝对路径");
  if (!path.isAbsolute(fcstdPath) || !/\.fcstd$/i.test(fcstdPath)) {
    throw new Error("请选择绝对路径的 .FCStd 文件");
  }
  try {
    const { stdout, stderr } = await executor(
      binaryPath,
      ["--protocol", "1", "read", fcstdPath],
      {
        encoding: "utf8",
        timeout: READ_TIMEOUT_MS,
        maxBuffer: READ_MAX_BUFFER_BYTES,
        windowsHide: true,
      },
    );
    if (stderr.trim()) throw new Error(`fcstd-read 写入 stderr：${stderr.trim()}`);
    return parseReadResponse(stdout);
  } catch (error) {
    const stdout = readProcessText(error, "stdout");
    if (stdout) return parseReadResponse(stdout);
    throw error;
  }
}

function parseReadResponse(stdout: string): KtcCadReadSuccess {
  let response: PnwCadNativeV1ReadResponse;
  try {
    response = JSON.parse(stdout.trim()) as PnwCadNativeV1ReadResponse;
  } catch (error) {
    throw new Error("fcstd-read 返回了无效 JSON", { cause: error });
  }
  if (pnwIsCadNativeV1ReadSuccess(response)) return response;
  if (pnwIsCadNativeV1Envelope(response) && !response.ok) {
    throw new Error(`fcstd-read ${response.error.code}：${response.error.message}`);
  }
  throw new Error("fcstd-read 返回值不符合 Phoenix CAD native protocol v1");
}

function readProcessText(error: unknown, key: "stdout" | "stderr"): string {
  if (!error || typeof error !== "object") return "";
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}
