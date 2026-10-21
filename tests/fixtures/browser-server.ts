import express from "express";
import path from "node:path";
import { createApp } from "../../server/app.js";
import { createStore } from "../../server/store.js";
import { resolveInference } from "../../server/inference.js";

// Dedicated in-memory server: browser tests cannot touch the user's database.
const store = createStore(":memory:");
const app = express();
app.get("/api/status", (_req, res) =>
  res.json({
    provider: "llama.cpp",
    model: "Browser test fixture",
    ready: true,
    message: "Test fixture ready",
  }),
);
app.use(
  createApp(store, 4190, async (sources, _name, signal) => {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 400);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(signal.reason);
        },
        { once: true },
      );
    });
    return {
      card: resolveInference(
        {
          goal: [],
          progress: [],
          blockers: [],
          attempts: [],
          nextStep: null,
          questions: [],
        },
        sources,
      ),
      model: "Browser test fixture",
      durationMs: 400,
    };
  }),
);
app.use(express.static(path.resolve("dist")));
app.get("/{*path}", (_req, res) =>
  res.sendFile(path.resolve("dist/index.html")),
);
const server = app.listen(4190, "127.0.0.1");
process.on("SIGTERM", () => {
  server.closeAllConnections();
  server.close(() => {
    store.close();
    process.exit(0);
  });
});
