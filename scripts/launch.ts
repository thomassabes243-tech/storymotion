import { spawn } from "node:child_process";
export function launch(mode: "dev" | "start") {
  const worker = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/worker.ts"],
    { stdio: "inherit" },
  );
  const web = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", mode, "--hostname", "0.0.0.0"],
    { stdio: "inherit" },
  );
  let closing = false;
  const stop = (signal: "SIGINT" | "SIGTERM") => {
    if (closing) return;
    closing = true;
    worker.kill(signal);
    web.kill(signal);
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => stop(signal));
  web.on("exit", (code) => {
    stop("SIGTERM");
    process.exitCode = code || 0;
  });
  worker.on("exit", (code) => {
    if (!closing) {
      console.error("El worker de render terminó; deteniendo la web.");
      stop("SIGTERM");
      process.exitCode = code || 1;
    }
  });
}
