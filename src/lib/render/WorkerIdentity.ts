import { readFileSync } from "node:fs";
export function processIdentity(
  pid: number,
): { state: string; startedAt: string } | undefined {
  if (process.platform !== "linux") return undefined;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat
      .slice(stat.lastIndexOf(")") + 2)
      .trim()
      .split(/\s+/);
    return { state: fields[0], startedAt: fields[19] };
  } catch {
    return undefined;
  }
}
export function workerIsAlive(
  pid?: number,
  expectedStart?: string,
  inspect = processIdentity,
) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  const identity = inspect(pid);
  if (identity?.state === "Z" || identity?.state === "X") return false;
  if (expectedStart && identity && expectedStart !== identity.startedAt)
    return false;
  // A legacy job cannot already be owned by a newly starting worker itself.
  if (!expectedStart && pid === process.pid) return false;
  return true;
}
