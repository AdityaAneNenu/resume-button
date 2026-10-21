import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Scan, Source } from "../shared/types.js";
const execute = promisify(execFile);
const skip = new Set([
  ".git",
  "node_modules",
  ".runtime",
  ".resume-button",
  "dist",
  "build",
  ".next",
  ".venv",
  "venv",
  "__pycache__",
  "coverage",
  "artifacts",
]);
const extensions = new Set([
  ".md",
  ".txt",
  ".log",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".json",
  ".css",
  ".html",
  ".rs",
  ".go",
  ".yaml",
  ".yml",
]);
export function allowedFile(name: string) {
  const lower = name.toLowerCase();
  return (
    !lower.startsWith(".") &&
    !/(^|[._-])(secret|credentials?|tokens?|private|id_rsa|id_ed25519|lock)([._-]|$)/i.test(
      lower,
    ) &&
    !["package-lock.json", "pnpm-lock.yaml", "yarn.lock"].includes(lower) &&
    extensions.has(path.extname(lower))
  );
}
export async function scanFolder(rootPath: string): Promise<Scan> {
  if (!path.isAbsolute(rootPath))
    throw new Error("Enter an absolute project folder path.");
  const root = await fs.realpath(rootPath);
  if (!(await fs.stat(root)).isDirectory())
    throw new Error("That path is not a folder.");
  const candidates: string[] = [],
    warnings: string[] = [];
  let inspected = 0;
  const walk = async (dir: string, depth: number) => {
    if (depth > 3 || candidates.length >= 80 || inspected >= 400) return;
    for (const item of await fs.readdir(dir, { withFileTypes: true })) {
      if (++inspected > 400 || candidates.length >= 80) break;
      if (item.isSymbolicLink()) continue;
      if (
        item.isDirectory() &&
        !skip.has(item.name) &&
        !item.name.startsWith(".")
      )
        await walk(path.join(dir, item.name), depth + 1);
      else if (item.isFile() && allowedFile(item.name))
        candidates.push(path.join(dir, item.name));
    }
  };
  await walk(root, 0);
  candidates.sort((a, b) => {
    const score = (p: string) =>
      /notes|handoff|readme|todo|error|test-output/i.test(p) ? 0 : 1;
    return score(a) - score(b) || a.localeCompare(b);
  });
  const sources: Source[] = [];
  for (const candidate of candidates.slice(0, 16)) {
    // Re-resolve at read time as a second guard against symlink/junction escape.
    const resolved = await fs.realpath(candidate);
    const relative = path.relative(root, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) continue;
    const handle = await fs.open(resolved, "r");
    try {
      const buffer = Buffer.alloc(24_000);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const text = buffer.subarray(0, bytesRead).toString("utf8");
      if (!text.trim() || text.includes("\0")) continue;
      const name = path.relative(root, candidate).replaceAll("\\", "/");
      if (text.length > 6000)
        warnings.push(`${name}: only the first 6,000 characters are included.`);
      sources.push({
        id: `file-${sources.length + 1}`,
        name,
        content: text.slice(0, 6000).replaceAll("\r\n", "\n"),
        kind: name.endsWith(".log") ? "log" : "file",
      });
    } finally {
      await handle.close();
    }
  }
  if (candidates.length > 16 || inspected >= 400)
    warnings.push(
      "This scan is limited to 16 text files and four folder levels. You can import other files directly.",
    );
  try {
    const { stdout } = await execute(
      "git",
      [
        "--no-pager",
        "-C",
        root,
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.quotePath=true",
        "status",
        "--short",
        "--branch",
        "--untracked-files=no",
      ],
      { windowsHide: true, timeout: 4000, maxBuffer: 100_000 },
    );
    if (stdout.trim())
      sources.push({
        id: "git-status",
        name: "Git status at capture",
        content: stdout.slice(0, 6000),
        kind: "git",
      });
  } catch {
    /* Non-Git folders are supported. */
  }
  if (candidates.length) {
    try {
      const files = candidates
        .slice(0, 16)
        .map((file) => path.relative(root, file));
      const { stdout } = await execute(
        "git",
        [
          "--no-pager",
          "-C",
          root,
          "-c",
          "core.fsmonitor=false",
          "diff",
          "--no-ext-diff",
          "--no-textconv",
          "--ignore-submodules",
          "--unified=2",
          "--",
          ...files,
        ],
        { windowsHide: true, timeout: 4000, maxBuffer: 200_000 },
      );
      if (stdout.trim())
        sources.push({
          id: "git-diff",
          name: "Uncommitted changes (unstaged)",
          content: stdout.slice(0, 6000).replaceAll("\r\n", "\n"),
          kind: "git",
        });
      if (stdout.length > 6000)
        warnings.push(
          "Git diff: only the first 6,000 characters are included.",
        );
    } catch {
      /* Large diffs or non-Git folders can still use ordinary sources. */
    }
  }
  return { sources, warnings };
}
