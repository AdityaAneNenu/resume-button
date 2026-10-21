import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
const children = [];
const port = Number(process.env.PORT ?? 4173);
const appUrl = `http://127.0.0.1:${port}`;
try {
  const response = await fetch(appUrl + "/api/projects", {
    signal: AbortSignal.timeout(1500),
  });
  if (response.ok) {
    console.log(`Resume Button is already running at ${appUrl}`);
    process.exit(0);
  }
} catch {
  /* Start the local app below. */
}
if (process.env.MODEL_PROVIDER !== "ollama" && !process.env.MODEL_URL) {
  let ready = false;
  try {
    ready = (
      await fetch("http://127.0.0.1:8081/health", {
        signal: AbortSignal.timeout(1500),
      })
    ).ok;
  } catch {}
  if (!ready)
    children.push(
      spawn(process.execPath, ["scripts/model.mjs"], {
        cwd: root,
        stdio: "inherit",
        windowsHide: true,
      }),
    );
}
const production = process.argv.includes("--production");
if (production && !existsSync(path.join(root, "dist/index.html"))) {
  console.error("Run npm run build before starting production.");
  for (const child of children) child.kill();
  process.exit(1);
}
children.push(
  spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "server/index.ts",
      ...(production ? ["--production"] : []),
    ],
    { cwd: root, stdio: "inherit", windowsHide: true },
  ),
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill();
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
for (const child of children) {
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) stop(code ?? 1);
  });
}
