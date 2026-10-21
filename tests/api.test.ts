import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app.js";
import { createStore } from "../server/store.js";
import { sampleSnapshot } from "../server/sample.js";
import { BackupSchema } from "../server/backup.js";
import { restoreCapture } from "../shared/session.js";

async function fixture(
  run: (url: string, store: ReturnType<typeof createStore>) => Promise<void>,
  generate?: Parameters<typeof createApp>[2],
) {
  const store = createStore(":memory:", false);
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  server.on("request", createApp(store, port, generate));
  try {
    await run(`http://127.0.0.1:${port}`, store);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  }
}
const json = (method: string, body: unknown = {}) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

test("project editing, card removal, missing IDs, and deletion preserve other projects", async () => {
  await fixture(async (url, store) => {
    let response = await fetch(
      url + "/api/projects",
      json("POST", { name: "First", rootPath: "C:/work" }),
    );
    assert.equal(response.status, 201);
    const first = await response.json();
    const second = store.addProject("Second", "", "");
    const saved = sampleSnapshot(first.id);
    store.addSnapshot(saved);
    response = await fetch(
      url + "/api/projects/" + first.id,
      json("PUT", {
        name: "Renamed",
        description: "New context",
        rootPath: "",
      }),
    );
    assert.equal((await response.json()).name, "Renamed");
    assert.equal(
      store.snapshots(first.id)[0].sources[0].content,
      saved.sources[0].content,
    );
    assert.equal(
      (
        await fetch(
          `${url}/api/projects/${second.id}/snapshots/${saved.id}`,
          json("DELETE"),
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await fetch(
          `${url}/api/projects/${first.id}/snapshots/${saved.id}`,
          json("DELETE"),
        )
      ).status,
      200,
    );
    assert.equal(store.getProject(first.id)?.snapshotCount, 0);
    assert.equal(
      (await fetch(`${url}/api/projects/${first.id}`, json("DELETE"))).status,
      200,
    );
    assert.equal(store.getProject(first.id), undefined);
    assert.ok(store.getProject(second.id));
  });
});

test("loopback API rejects cross-site mutations, incorrect content types, and invalid payloads", async () => {
  await fixture(async (url) => {
    assert.equal(
      (
        await fetch(url + "/api/projects", {
          ...json("POST", { name: "x" }),
          headers: {
            "Content-Type": "application/json",
            Origin: "https://example.com",
          },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(url + "/api/projects", {
          ...json("POST", { name: "x" }),
          headers: {
            "Content-Type": "application/json",
            "Sec-Fetch-Site": "cross-site",
          },
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(url + "/api/projects", { method: "POST", body: "{}" }))
        .status,
      415,
    );
    assert.equal(
      (await fetch(url + "/api/projects", json("POST", { name: "  " }))).status,
      400,
    );
    assert.equal(
      (await fetch(url + "/api/projects", { ...json("POST"), body: "{broken" }))
        .status,
      400,
    );
    assert.equal((await fetch(url + "/api/missing")).status, 404);
    const response = await fetch(url + "/api/projects");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  });
});

test("backup restore validates quotes, remaps IDs, drops folder paths, and keeps existing data", async () => {
  await fixture(async (url, store) => {
    const project = store.addProject("Original", "", "C:/private-folder");
    store.addSnapshot(sampleSnapshot(project.id));
    const backup = await fetch(url + "/api/backup").then((response) =>
      response.json(),
    );
    assert.equal(backup.projects[0].project.rootPath, "");
    BackupSchema.parse(backup);
    const response = await fetch(url + "/api/restore", json("POST", backup));
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { projects: 1, snapshots: 1 });
    const restored = store.listProjects().find((p) => p.id !== project.id)!;
    assert.ok(restored);
    assert.equal(restored.rootPath, "");
    assert.notEqual(
      store.snapshots(restored.id)[0].id,
      store.snapshots(project.id)[0].id,
    );
    assert.deepEqual(
      store.snapshots(restored.id)[0].sources,
      store.snapshots(project.id)[0].sources,
    );
    backup.projects[0].snapshots[0].card.progress[0].quote =
      "This quote was fabricated.";
    assert.equal(
      (await fetch(url + "/api/restore", json("POST", backup))).status,
      400,
    );
    assert.equal(store.listProjects().length, 2);
    backup.version = 999;
    assert.equal(
      (await fetch(url + "/api/restore", json("POST", backup))).status,
      400,
    );
  });
});

test("client cancellation aborts inference, releases the busy slot, and does not save a card", async () => {
  let started!: () => void, cancelled!: () => void;
  const start = new Promise<void>((resolve) => (started = resolve)),
    cancel = new Promise<void>((resolve) => (cancelled = resolve));
  let requests = 0;
  await fixture(
    async (url, store) => {
      const project = store.addProject("Test", "", "");
      const options = json("POST", {
        sources: [
          {
            id: "note",
            name: "note",
            kind: "note",
            content: "Completed: Added the form.",
          },
        ],
      });
      const controller = new AbortController();
      const running = fetch(`${url}/api/projects/${project.id}/snapshots`, {
        ...options,
        signal: controller.signal,
      });
      const failure = assert.rejects(
        running,
        (error) => (error as Error).name === "AbortError",
      );
      await start;
      assert.equal(
        (await fetch(`${url}/api/projects/${project.id}/snapshots`, options))
          .status,
        409,
      );
      assert.equal(
        (await fetch(`${url}/api/projects/${project.id}`, json("DELETE")))
          .status,
        409,
      );
      controller.abort();
      await failure;
      await cancel;
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(store.snapshots(project.id).length, 0);
      const response = await fetch(
        `${url}/api/projects/${project.id}/snapshots`,
        options,
      );
      assert.equal(response.status, 201);
      assert.equal(store.snapshots(project.id).length, 1);
    },
    async (_sources, _name, signal) => {
      if (++requests === 1) {
        started();
        await new Promise<void>((_resolve, reject) =>
          signal!.addEventListener(
            "abort",
            () => {
              cancelled();
              reject(signal!.reason);
            },
            { once: true },
          ),
        );
      }
      return {
        card: sampleSnapshot("fixture").card,
        model: "fixture",
        durationMs: 1,
      };
    },
  );
});

test("invalid capture limits are rejected before inference", async () => {
  let called = false;
  await fixture(
    async (url, store) => {
      const p = store.addProject("Test", "", "");
      const source = {
        id: "one",
        name: "note",
        kind: "note",
        content: "Valid content",
      };
      for (const sources of [
        [],
        [source, source],
        [{ ...source, content: "x".repeat(6001) }],
        Array.from({ length: 4 }, (_, i) => ({
          ...source,
          id: String(i),
          content: "x".repeat(5000),
        })),
      ]) {
        assert.equal(
          (
            await fetch(
              `${url}/api/projects/${p.id}/snapshots`,
              json("POST", { sources }),
            )
          ).status,
          400,
        );
      }
      assert.equal(called, false);
    },
    async () => {
      called = true;
      return {
        card: sampleSnapshot("fixture").card,
        model: "fixture",
        durationMs: 1,
      };
    },
  );
});

test("full draft restoration validates source contents and selection IDs", () => {
  const source = {
    id: "note",
    name: "work.md",
    content: "Actual work context.",
    kind: "note",
  };
  const draft = restoreCapture(
    JSON.stringify({
      mode: "free",
      note: "My draft.",
      sources: [source, source, { ...source, id: "bad", content: 42 }],
      selected: ["note", "missing"],
      scanned: ["note", null],
    }),
  );
  assert.equal(draft.note, "My draft.");
  assert.deepEqual(draft.sources, [source]);
  assert.deepEqual(draft.selected, ["note"]);
  assert.deepEqual(draft.scanned, ["note"]);
  assert.equal(draft.restoredSources, true);
  assert.equal(restoreCapture('{"sources":[]}').restoredSources, true);
  assert.equal(restoreCapture(null).restoredSources, false);
});
