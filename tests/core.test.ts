import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { anchorCard, toMarkdown } from "../server/cards.js";
import { SAMPLE_SOURCES, sampleSnapshot } from "../server/sample.js";
import { createStore } from "../server/store.js";
import { allowedFile, scanFolder } from "../server/sources.js";
import { localEndpoint } from "../server/model.js";

const modelCard = () => ({
  recap: "The input is connected; stale results remain.",
  goal: [],
  progress: [
    {
      sourceId: "sample-notes",
      quote: "The search input and destination cards are connected to the API.",
    },
  ],
  blockers: [],
  attempts: [],
  nextStep: {
    title: "Inspect request ordering.",
    detail: "Test requests that resolve in reverse order.",
    sourceIds: ["sample-code"],
  },
  questions: [],
});

test("exact quotes are anchored to the correct saved source line", () => {
  const card = anchorCard(modelCard(), SAMPLE_SOURCES);
  assert.equal(card.progress[0].line, 5);
  assert.equal(card.discardedQuotes, 0);
});
test("fabricated quotes and nonexistent source IDs are discarded", () => {
  const raw = modelCard();
  raw.progress.push(
    {
      sourceId: "sample-notes",
      quote: "Everything is now fixed and all tests pass.",
    },
    {
      sourceId: "missing",
      quote: "The search input and destination cards are connected to the API.",
    },
  );
  const card = anchorCard(raw, SAMPLE_SOURCES);
  assert.equal(card.progress.length, 1);
  assert.equal(card.discardedQuotes, 2);
});
test("wholly unsupported model output fails rather than becoming a saved card", () => {
  const raw = modelCard();
  raw.progress[0].quote = "Fabricated completed work.";
  assert.throws(
    () => anchorCard(raw, SAMPLE_SOURCES),
    /matching source quotes/,
  );
});
test("a suggested step with invented source references is removed", () => {
  const raw = modelCard();
  raw.nextStep.sourceIds = ["invented"];
  assert.equal(anchorCard(raw, SAMPLE_SOURCES).nextStep, null);
});
test("duplicate quotes are not shown twice", () => {
  const raw = modelCard();
  raw.progress.push(raw.progress[0]);
  assert.equal(anchorCard(raw, SAMPLE_SOURCES).progress.length, 1);
});
test("valid JSON with the wrong shape is rejected", () => {
  assert.throws(() => anchorCard({ recap: "Looks fine." }, SAMPLE_SOURCES));
  assert.throws(() => anchorCard("success", SAMPLE_SOURCES));
});
test("export labels generated suggestions and retains evidence locations", () => {
  const card = sampleSnapshot("demo");
  const markdown = toMarkdown("Atlas", card.createdAt, card.card, card.sources);
  assert.match(markdown, /Suggested next step \(AI-generated\)/);
  assert.match(markdown, /work-notes.md, line 5/);
  assert.match(markdown, /FAIL keeps results/);
});
test("local model endpoint cannot redirect source data to a remote provider", () => {
  assert.equal(localEndpoint("http://127.0.0.1:8081"), "http://127.0.0.1:8081");
  for (const endpoint of [
    "https://api.example.com",
    "http://127.0.0.1.evil.test",
    "http://user:pass@localhost",
    "file:///etc/passwd",
    "http://localhost:8081/proxy",
    "http://localhost?target=remote",
  ])
    assert.throws(() => localEndpoint(endpoint));
});
test("scanner excludes common secrets, lockfiles, and unsupported binaries", () => {
  for (const name of [
    ".env",
    ".env.local",
    "credentials.json",
    "app-secret.json",
    "id_rsa",
    "package-lock.json",
    "photo.png",
    "private.key",
  ])
    assert.equal(allowedFile(name), false, name);
  for (const name of ["work-notes.md", "search.ts", "test-output.log"])
    assert.equal(allowedFile(name), true, name);
});
test("scan skips dependency folders and junctions, and reports text truncation", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "resume-scan-"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "resume-outside-"));
  try {
    await fs.writeFile(path.join(temp, "notes.md"), "My actual project note.");
    await fs.writeFile(path.join(temp, ".env"), "DO_NOT_READ=secret");
    await fs.mkdir(path.join(temp, "node_modules"));
    await fs.writeFile(
      path.join(temp, "node_modules", "dependency.js"),
      "Not project context.",
    );
    await fs.writeFile(path.join(temp, "big.txt"), "x".repeat(7000));
    await fs.writeFile(
      path.join(outside, "outside.md"),
      "Outside the selected project.",
    );
    await fs.symlink(outside, path.join(temp, "linked"), "junction");
    const result = await scanFolder(temp);
    assert.deepEqual(result.sources.map((s) => s.name).sort(), [
      "big.txt",
      "notes.md",
    ]);
    assert.equal(
      result.sources.find((s) => s.name === "big.txt")?.content.length,
      6000,
    );
    assert.match(result.warnings.join(" "), /first 6,000/);
  } finally {
    // Both targets are absolute task-owned directories created by mkdtemp above.
    await fs.rm(temp, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});
test("history survives closing and reopening the database without rewriting old sources", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "resume-store-"));
  const database = path.join(temp, "test.db");
  let store = createStore(database, false);
  try {
    const project = store.addProject("Project", "Test", "");
    const first = sampleSnapshot(project.id);
    first.id = "first";
    first.createdAt = "2026-10-20T10:00:00Z";
    store.addSnapshot(first);
    const next = structuredClone(first);
    next.id = "second";
    next.createdAt = "2026-10-20T11:00:00Z";
    next.sources[0].content = "The new session has a different state.";
    store.addSnapshot(next);
    store.close();
    store = createStore(database, false);
    const snapshots = store.snapshots(project.id);
    assert.equal(snapshots.length, 2);
    assert.equal(snapshots[0].id, "second");
    assert.match(snapshots[1].sources[0].content, /A 300 ms debounce/);
    assert.equal(store.getProject(project.id)?.snapshotCount, 2);
  } finally {
    store.close();
    await fs.rm(temp, { recursive: true, force: true });
  }
});

test("removing every project stays empty after restarting the app", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "resume-empty-"));
  const database = path.join(temp, "test.db");
  let store = createStore(database);
  try {
    const example = store.listProjects()[0];
    assert.ok(example.sample);
    store.deleteProject(example.id);
    store.close();
    store = createStore(database);
    assert.deepEqual(store.listProjects(), []);
  } finally {
    store.close();
    await fs.rm(temp, { recursive: true, force: true });
  }
});
