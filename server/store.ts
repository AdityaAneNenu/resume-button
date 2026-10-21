import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Project, Snapshot } from "../shared/types.js";
import { sampleSnapshot } from "./sample.js";
import type { Backup } from "./backup.js";

export function createStore(file: string, seed = true) {
  if (file !== ":memory:")
    fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, rootPath TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, sample INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS snapshots (id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, createdAt TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS snapshots_project ON snapshots(projectId, createdAt);`);
  const projectQuery = `SELECT p.*, (SELECT COUNT(*) FROM snapshots s WHERE s.projectId=p.id) AS snapshotCount FROM projects p`;
  const convert = (row: any): Project => ({
    ...row,
    sample: Boolean(row.sample),
  });
  const getProject = (id: string): Project | undefined => {
    const row = db.prepare(projectQuery + " WHERE p.id=?").get(id);
    return row ? convert(row) : undefined;
  };
  const addSnapshot = (snapshot: Snapshot) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("INSERT INTO snapshots VALUES (?, ?, ?, ?)").run(
        snapshot.id,
        snapshot.projectId,
        snapshot.createdAt,
        JSON.stringify(snapshot),
      );
      db.prepare("UPDATE projects SET updatedAt=? WHERE id=?").run(
        snapshot.createdAt,
        snapshot.projectId,
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const addProject = (
    name: string,
    description: string,
    rootPath: string,
    sample = false,
  ) => {
    const id = randomUUID(),
      now = new Date().toISOString();
    db.prepare("INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      id,
      name,
      description,
      rootPath,
      now,
      now,
      Number(sample),
    );
    return getProject(id)!;
  };
  if (
    seed &&
    !db.prepare("SELECT value FROM settings WHERE key='seeded'").get()
  ) {
    if (!db.prepare("SELECT id FROM projects LIMIT 1").get()) {
      const project = addProject(
        "Weekend Atlas",
        "A small trip planner for slow weekends.",
        "",
        true,
      );
      addSnapshot(sampleSnapshot(project.id));
    }
    db.prepare("INSERT INTO settings VALUES ('seeded', '1')").run();
  }
  const snapshots = (id: string): Snapshot[] =>
    db
      .prepare(
        "SELECT data FROM snapshots WHERE projectId=? ORDER BY createdAt DESC, rowid DESC",
      )
      .all(id)
      .map((row) => JSON.parse(row.data as string));
  const listProjects = () =>
    db
      .prepare(projectQuery + " ORDER BY p.updatedAt DESC")
      .all()
      .map(convert);
  return {
    listProjects: () =>
      db
        .prepare(projectQuery + " ORDER BY p.updatedAt DESC")
        .all()
        .map(convert),
    getProject,
    addProject,
    addSnapshot,
    updateProject: (
      id: string,
      name: string,
      description: string,
      rootPath: string,
    ) => {
      db.prepare(
        "UPDATE projects SET name=?, description=?, rootPath=?, updatedAt=? WHERE id=?",
      ).run(name, description, rootPath, new Date().toISOString(), id);
      return getProject(id);
    },
    deleteSnapshot: (projectId: string, id: string) =>
      db
        .prepare("DELETE FROM snapshots WHERE projectId=? AND id=?")
        .run(projectId, id),
    backup: (): Backup => ({
      format: "resume-button",
      version: 1,
      exportedAt: new Date().toISOString(),
      projects: listProjects().map((project) => ({
        project: { ...project, rootPath: "" },
        snapshots: snapshots(project.id),
      })),
    }),
    restore: (backup: Backup) => {
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const entry of backup.projects) {
          const projectId = randomUUID();
          db.prepare("INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?)").run(
            projectId,
            entry.project.name,
            entry.project.description,
            "",
            entry.project.createdAt,
            entry.project.updatedAt,
            Number(entry.project.sample),
          );
          for (const saved of entry.snapshots) {
            const snapshot = { ...saved, id: randomUUID(), projectId };
            db.prepare("INSERT INTO snapshots VALUES (?, ?, ?, ?)").run(
              snapshot.id,
              projectId,
              snapshot.createdAt,
              JSON.stringify(snapshot),
            );
          }
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return {
        projects: backup.projects.length,
        snapshots: backup.projects.reduce(
          (n, entry) => n + entry.snapshots.length,
          0,
        ),
      };
    },
    snapshots: (id: string): Snapshot[] =>
      db
        .prepare(
          "SELECT data FROM snapshots WHERE projectId=? ORDER BY createdAt DESC, rowid DESC",
        )
        .all(id)
        .map((row) => JSON.parse(row.data as string)),
    deleteProject: (id: string) =>
      db.prepare("DELETE FROM projects WHERE id=?").run(id),
    close: () => db.close(),
  };
}
