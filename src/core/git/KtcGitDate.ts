/** Converts Git's canonical date to an editable wall-clock value in the current machine timezone. */
export function KtcFormatGitDate(value: string): string {
  const match = /^(\d+) [+-]\d{4}$/u.exec(value.trim());
  if (!match) return value.trim();
  const local = new Date(Number(match[1]) * 1_000);
  if (Number.isNaN(local.getTime())) return value.trim();
  return [
    local.getFullYear().toString().padStart(4, "0"),
    (local.getMonth() + 1).toString().padStart(2, "0"),
    local.getDate().toString().padStart(2, "0"),
  ].join("-") + ` ${[
    local.getHours().toString().padStart(2, "0"),
    local.getMinutes().toString().padStart(2, "0"),
    local.getSeconds().toString().padStart(2, "0"),
  ].join(":")}`;
}

/** Converts the machine-local editable value back to Git's canonical date representation. */
export function KtcNormalizeGitDateInput(value: string): string {
  const normalized = value.trim();
  if (/^\d+ [+-]\d{4}$/u.test(normalized)) return normalized;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/u.exec(normalized);
  if (!match) throw new Error("时间格式应为 YYYY-MM-DD HH:mm:ss");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);
  const instant = new Date(year, month - 1, day, hour, minute, second, 0);
  if (Number.isNaN(instant.getTime())
    || instant.getFullYear() !== year
    || instant.getMonth() !== month - 1
    || instant.getDate() !== day
    || instant.getHours() !== hour
    || instant.getMinutes() !== minute
    || instant.getSeconds() !== second) {
    throw new Error("时间值无效");
  }
  const offsetMinutes = -instant.getTimezoneOffset();
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offset = `${sign}${Math.floor(absoluteOffset / 60).toString().padStart(2, "0")}${(absoluteOffset % 60).toString().padStart(2, "0")}`;
  return `${Math.floor(instant.getTime() / 1_000)} ${offset}`;
}
