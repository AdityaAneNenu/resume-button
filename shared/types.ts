export type Source = {
  id: string;
  name: string;
  content: string;
  kind: "file" | "note" | "log" | "git";
};
export type Evidence = { sourceId: string; quote: string; line: number };
export type Card = {
  recap: string;
  recapOrigin?: "evidence";
  goal: Evidence[];
  progress: Evidence[];
  blockers: Evidence[];
  attempts: Evidence[];
  nextStep: {
    title: string;
    detail: string;
    sourceIds: string[];
    origin?: "author" | "model";
    evidence?: Evidence[];
  } | null;
  questions: string[];
  discardedQuotes: number;
  evidencePolicy?: string;
};
export type Snapshot = {
  id: string;
  projectId: string;
  createdAt: string;
  mode: "example" | "local";
  model: string;
  durationMs: number | null;
  sources: Source[];
  card: Card;
};
export type Project = {
  id: string;
  name: string;
  description: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
  snapshotCount: number;
  sample: boolean;
};
export type ProjectDetail = { project: Project; snapshots: Snapshot[] };
export type ModelStatus = {
  ready: boolean;
  provider: "llama.cpp" | "ollama";
  model: string;
  message: string;
};
export type Scan = { sources: Source[]; warnings: string[] };
