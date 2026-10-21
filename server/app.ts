import express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createStore } from "./store.js";
import { generateCard, modelStatus } from "./model.js";
import { scanFolder } from "./sources.js";
import { toMarkdown } from "./cards.js";
import type { Snapshot } from "../shared/types.js";
import { projectInput, snapshotInput } from "../shared/validation.js";
import { BackupSchema } from "./backup.js";

export function createApp(
  store: ReturnType<typeof createStore>,
  port = 4173,
  generate = generateCard,
) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const host = req.headers.host?.split(":")[0];
    if (!host || !["localhost", "127.0.0.1"].includes(host))
      return res
        .status(403)
        .json({ error: "Resume Button only accepts local requests." });
    if (req.path.startsWith("/api")) {
      const origin = req.headers.origin;
      const allowedOrigins = [
        `http://localhost:${port}`,
        `http://127.0.0.1:${port}`,
      ];
      if (
        (origin && !allowedOrigins.includes(origin)) ||
        req.headers["sec-fetch-site"] === "cross-site"
      )
        return res
          .status(403)
          .json({ error: "Cross-site requests are not allowed." });
      if (
        ["POST", "DELETE", "PUT"].includes(req.method) &&
        !req.is("application/json")
      )
        return res.status(415).json({ error: "Send application/json." });
      res.setHeader("Cache-Control", "no-store");
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  app.use(express.json({ limit: "10mb" }));
  app.get("/api/status", async (_req, res) => res.json(await modelStatus()));
  app.get("/api/projects", (_req, res) => res.json(store.listProjects()));
  app.post("/api/projects", (req, res) => {
    const p = projectInput.parse(req.body);
    res.status(201).json(store.addProject(p.name, p.description, p.rootPath));
  });
  app.get("/api/projects/:id", (req, res) => {
    const project = store.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found." });
    res.json({ project, snapshots: store.snapshots(project.id) });
  });
  app.post("/api/projects/:id/scan", async (req, res) => {
    const project = store.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (!project.rootPath)
      return res.status(400).json({
        error: "This project has no folder attached. Import files instead.",
      });
    try {
      res.json(await scanFolder(project.rootPath));
    } catch {
      res.status(400).json({
        error:
          "Could not read that project folder. Check the path and permissions, or import files directly.",
      });
    }
  });
  let generating: { projectId: string; controller: AbortController } | null =
    null;
  app.put("/api/projects/:id", (req, res) => {
    if (!store.getProject(req.params.id))
      return res.status(404).json({ error: "Project not found." });
    const p = projectInput.parse(req.body);
    res.json(
      store.updateProject(req.params.id, p.name, p.description, p.rootPath),
    );
  });
  app.delete("/api/projects/:id", (req, res) => {
    if (!store.getProject(req.params.id))
      return res.status(404).json({ error: "Project not found." });
    if (generating?.projectId === req.params.id)
      return res
        .status(409)
        .json({ error: "Cancel generation before removing this project." });
    store.deleteProject(req.params.id);
    res.json({ ok: true });
  });
  app.delete("/api/projects/:id/snapshots/:snapshotId", (req, res) => {
    const deleted = store.deleteSnapshot(req.params.id, req.params.snapshotId);
    if (!deleted.changes)
      return res.status(404).json({ error: "Card not found." });
    res.json({ ok: true });
  });
  app.get("/api/backup", (_req, res) =>
    res
      .type("application/json")
      .set(
        "Content-Disposition",
        'attachment; filename="resume-button-backup.json"',
      )
      .send(JSON.stringify(store.backup(), null, 2)),
  );
  app.post("/api/restore", (req, res) =>
    res.status(201).json(store.restore(BackupSchema.parse(req.body))),
  );
  app.post("/api/projects/:id/snapshots", async (req, res) => {
    const project = store.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found." });
    const input = snapshotInput.parse(req.body);
    if (generating)
      return res.status(409).json({
        error:
          "A card is already being generated. Please wait for it to finish.",
      });
    const controller = new AbortController();
    generating = { projectId: project.id, controller };
    const disconnect = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.once("close", disconnect);
    try {
      const result = await generate(
        input.sources,
        project.name,
        controller.signal,
      );
      controller.signal.throwIfAborted();
      const snapshot: Snapshot = {
        ...result,
        id: randomUUID(),
        projectId: project.id,
        createdAt: new Date().toISOString(),
        mode: "local",
        sources: input.sources,
      };
      store.addSnapshot(snapshot);
      res.status(201).json(snapshot);
    } catch (error) {
      if (controller.signal.aborted) return;
      res.status(502).json({
        error:
          error instanceof Error ? error.message : "Could not create the card.",
      });
    } finally {
      res.off("close", disconnect);
      generating = null;
    }
  });
  app.get("/api/projects/:id/snapshots/:snapshotId/export", (req, res) => {
    const project = store.getProject(req.params.id);
    const snapshot = store
      .snapshots(req.params.id)
      .find((s) => s.id === req.params.snapshotId);
    if (!project || !snapshot)
      return res.status(404).json({ error: "Card not found." });
    res
      .type("text/markdown")
      .setHeader(
        "Content-Disposition",
        'attachment; filename="resume-card.md"',
      );
    res.send(
      toMarkdown(
        project.name,
        snapshot.createdAt,
        snapshot.card,
        snapshot.sources,
      ),
    );
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof z.ZodError)
        return res
          .status(400)
          .json({ error: error.issues.map((i) => i.message).join(" ") });
      if (error instanceof SyntaxError)
        return res.status(400).json({ error: "Invalid JSON request." });
      if (
        typeof error === "object" &&
        error &&
        "type" in error &&
        error.type === "entity.too.large"
      )
        return res.status(413).json({
          error: "The request is too large. Import fewer or smaller files.",
        });
      console.error(
        "Request failed:",
        error instanceof Error ? error.message : "Unknown error",
      );
      res.status(500).json({
        error: "Something went wrong. Your saved cards are still available.",
      });
    },
  );

  return app;
}
