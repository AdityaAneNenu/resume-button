import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
function locate(dir) {
  if (!existsSync(dir)) return undefined;
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.name === "llama-server.exe") return p;
    if (item.isDirectory()) {
      const found = locate(p);
      if (found) return found;
    }
  }
}
const binary = locate(path.join(root, ".runtime/llama"));
const model = path.join(
  root,
  ".runtime/models/qwen2.5-1.5b-instruct-q4_k_m.gguf",
);
if (!binary || !existsSync(model)) {
  console.error(
    "Run npm run setup:model first, or configure an existing local model (see README).",
  );
  process.exit(1);
}
const child = spawn(
  binary,
  [
    "--model",
    model,
    "--host",
    "127.0.0.1",
    "--port",
    "8081",
    "--ctx-size",
    "8192",
    "--parallel",
    "1",
    "--threads",
    "6",
    "--alias",
    "qwen2.5-1.5b-instruct",
    "--no-webui",
  ],
  { stdio: "inherit", windowsHide: true },
);
process.on("SIGINT", () => child.kill());
process.on("SIGTERM", () => child.kill());
child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
