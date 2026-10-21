import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "./store.js";
import { createApp } from "./app.js";
const root = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be between 1 and 65535.");
const store = createStore(
  process.env.RESUME_DATA_PATH ?? path.join(root, ".resume-button/resume.db"),
);
const app = createApp(store, port);
if (process.argv.includes("--production")) {
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.join(root, "dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    server: { middlewareMode: true, hmr: { port: port + 1 } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const server = app.listen(port, "127.0.0.1", () =>
  console.log(`Resume Button is ready at http://127.0.0.1:${port}`),
);

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.close(() => {
    store.close();
    process.exit(0);
  });
  server.closeAllConnections();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("error", (error) => {
  console.error(error.message);
  store.close();
  process.exit(1);
});
