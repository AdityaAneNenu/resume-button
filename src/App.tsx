import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  Copy,
  FileText,
  Folder,
  FolderOpen,
  History,
  Leaf,
  LoaderCircle,
  LockKeyhole,
  MoreHorizontal,
  PanelLeft,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type {
  Evidence,
  ModelStatus,
  Project,
  ProjectDetail,
  Scan,
  Snapshot,
  Source,
} from "../shared/types";
import { SESSION_FIELDS, restoreCapture, sessionNote } from "../shared/session";
import { BackupPanel } from "./BackupPanel";

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}
const date = (value: string, time = false) =>
  new Intl.DateTimeFormat(
    undefined,
    time
      ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
      : { month: "short", day: "numeric" },
  ).format(new Date(value));
function SourceIcon({ source, size = 17 }: { source: Source; size?: number }) {
  return source.kind === "log" || source.kind === "git" ? (
    <Terminal size={size} />
  ) : /\.(ts|tsx|js|py|rs|go)$/.test(source.name) ? (
    <Code2 size={size} />
  ) : (
    <FileText size={size} />
  );
}

function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  busy = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("input, textarea, button")?.focus();
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) closeRef.current();
      if (event.key !== "Tab") return;
      const items = [
        ...(ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], select",
        ) ?? []),
      ].filter((el) => el.getClientRects().length);
      if (!items.length) {
        event.preventDefault();
        ref.current?.focus();
        return;
      }
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [busy]);
  return (
    <div
      className="modal-shade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "modal-wide" : ""}`}
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
            disabled={busy}
          >
            <X size={21} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function Quote({
  evidence,
  sources,
  onOpen,
}: {
  evidence: Evidence;
  sources: Source[];
  onOpen: (s: Source, line?: number) => void;
}) {
  const source = sources.find((s) => s.id === evidence.sourceId);
  return (
    <div className="quote">
      <p>{evidence.quote}</p>
      {source && (
        <button
          className="source-link"
          onClick={() => onOpen(source, evidence.line)}
        >
          <SourceIcon source={source} size={12} />
          <span>{source.name}</span>
          <span className="line-label">L{evidence.line}</span>
          <ChevronRight size={12} />
        </button>
      )}
    </div>
  );
}

function SourceViewer({
  source,
  line,
  onClose,
}: {
  source: Source;
  line?: number;
  onClose: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    contentRef.current
      ?.querySelector(`[data-line="${line}"]`)
      ?.scrollIntoView({ block: "center" });
  }, [line]);
  return (
    <Modal
      title={source.name}
      subtitle="Saved source · this copy stays with its resume card"
      onClose={onClose}
      wide
    >
      <div className="source-viewer" ref={contentRef}>
        {source.content.split("\n").map((text, i) => (
          <div
            key={i}
            data-line={i + 1}
            className={`code-line ${line === i + 1 ? "highlighted-line" : ""}`}
          >
            <span>{i + 1}</span>
            <code>{text || " "}</code>
          </div>
        ))}
      </div>
      <div className="modal-footer">
        <span>
          <LockKeyhole size={13} /> Stored on this device
        </span>
        <button className="button secondary small" onClick={onClose}>
          Back to my card
        </button>
      </div>
    </Modal>
  );
}

function CreateProject({
  onClose,
  onCreated,
  project,
}: {
  onClose: () => void;
  onCreated: (p: Project) => void;
  project?: Project;
}) {
  const [name, setName] = useState(project?.name ?? ""),
    [description, setDescription] = useState(project?.description ?? ""),
    [rootPath, setRootPath] = useState(project?.rootPath ?? "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onCreated(
        await api<Project>(
          project ? `/api/projects/${project.id}` : "/api/projects",
          {
            method: project ? "PUT" : "POST",
            body: JSON.stringify({ name, description, rootPath }),
          },
        ),
      );
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal
      title={project ? "Edit project" : "A place for your project."}
      subtitle="Give your unfinished work somewhere to come back to."
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit} className="form-stack">
        <label>
          Project name
          <input
            required
            autoFocus
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="The thing you're working on"
          />
        </label>
        <label>
          A little context <span className="optional">optional</span>
          <input
            maxLength={200}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What are you making?"
          />
        </label>
        <label>
          Project folder <span className="optional">optional</span>
          <input
            value={rootPath}
            onChange={(e) => setRootPath(e.target.value)}
            placeholder="C:\Users\you\Projects\my-project"
          />
          <small>
            Add an absolute path to scan local text files. You choose which
            files go into each card.
          </small>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-footer">
          <span>
            <LockKeyhole size={13} /> Just on your device
          </span>
          <button
            className="button primary"
            type="submit"
            disabled={busy || !name.trim()}
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Plus size={17} />
            )}
            {project ? "Save changes" : "Create project"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Capture({
  project,
  exampleSources,
  status,
  onClose,
  onSaved,
}: {
  project: Project;
  exampleSources: Source[];
  status: ModelStatus | null;
  onClose: () => void;
  onSaved: (s: Snapshot) => void;
}) {
  const draftKey = `resume-draft-${project.id}`;
  const [draft, setDraft] = useState(() => {
    try {
      return restoreCapture(localStorage.getItem(draftKey));
    } catch {
      return restoreCapture(null);
    }
  });
  const note = sessionNote(draft);
  const [sources, setSources] = useState<Source[]>(
    draft.restoredSources
      ? draft.sources
      : project.sample
        ? exampleSources
        : [],
  );
  const [selected, setSelected] = useState<Set<string>>(
    new Set(
      draft.restoredSources
        ? draft.selected
        : project.sample
          ? exampleSources.map((s) => s.id)
          : [],
    ),
  );
  const [error, setError] = useState(""),
    [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false),
    [scanning, setScanning] = useState(false),
    [importing, setImporting] = useState(false),
    [elapsed, setElapsed] = useState(0);
  const scannedIds = useRef(new Set<string>(draft.scanned));
  const generation = useRef<AbortController | null>(null);
  const completed = useRef(false);
  const [draftError, setDraftError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const selectedSources = sources.filter((s) => selected.has(s.id));
  const chars =
    selectedSources.reduce((n, s) => n + s.content.length, 0) + note.length;
  const sourceCount = selectedSources.length + (note ? 1 : 0);
  useEffect(() => {
    try {
      if (completed.current) return;
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          ...draft,
          sources,
          selected: [...selected],
          scanned: [...scannedIds.current],
        }),
      );
      setDraftError("");
    } catch {
      setDraftError(
        "Browser storage is full or unavailable. Keep this form open until you save your card.",
      );
    }
  }, [draftKey, draft, sources, selected]);
  useEffect(() => () => generation.current?.abort(), []);
  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  async function importFiles(files: FileList | null) {
    if (!files) return;
    setImporting(true);
    setError("");
    try {
      const added: Source[] = [],
        notices: string[] = [];
      if (files.length > 20)
        notices.push(
          "Imported the first 20 files. Add the others in a separate import.",
        );
      for (const file of [...files].slice(0, 20)) {
        if (file.size > 100_000) {
          notices.push(`${file.name} is too large. Import a smaller excerpt.`);
          continue;
        }
        const content = (await file.text()).replaceAll("\r\n", "\n");
        if (content.includes("\0") || !content.trim()) {
          notices.push(`${file.name} is empty or not a text file.`);
          continue;
        }
        if (content.length > 6000) {
          notices.push(`${file.name}: included the first 6,000 characters.`);
        }
        added.push({
          id: crypto.randomUUID(),
          name: file.name,
          content: content.slice(0, 6000),
          kind: /\.(log|md|txt)$/i.test(file.name)
            ? /\.log$/i.test(file.name)
              ? "log"
              : "note"
            : "file",
        });
      }
      setSources((prev) => [...prev, ...added]);
      setSelected((prev) => new Set([...prev, ...added.map((s) => s.id)]));
      setWarnings((prev) => [...prev, ...notices]);
      if (input.current) input.current.value = "";
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not read those files.",
      );
    } finally {
      setImporting(false);
    }
  }
  async function scan() {
    setScanning(true);
    setError("");
    try {
      const result = await api<Scan>(`/api/projects/${project.id}/scan`, {
        method: "POST",
        body: "{}",
      });
      const previousScan = scannedIds.current;
      setSources((previous) => [
        ...previous.filter((source) => !previousScan.has(source.id)),
        ...result.sources,
      ]);
      setSelected(
        (previous) =>
          new Set([...previous].filter((id) => !previousScan.has(id))),
      );
      scannedIds.current = new Set(result.sources.map((source) => source.id));
      setWarnings((previous) => [...previous, ...result.warnings]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (
      busy ||
      scanning ||
      importing ||
      !sourceCount ||
      sourceCount > 20 ||
      chars > 18000 ||
      note.length > 6000
    )
      return;
    setError("");
    setBusy(true);
    setElapsed(0);
    const controller = new AbortController();
    generation.current = controller;
    const payload = [...selectedSources];
    if (note)
      payload.push({
        id: crypto.randomUUID(),
        name: "Session note",
        content: note,
        kind: "note",
      });
    try {
      const snapshot = await api<Snapshot>(
        `/api/projects/${project.id}/snapshots`,
        {
          method: "POST",
          body: JSON.stringify({ sources: payload }),
          signal: controller.signal,
        },
      );
      try {
        completed.current = true;
        localStorage.removeItem(draftKey);
      } catch {
        /* The card is already saved in SQLite. */
      }
      onSaved(snapshot);
    } catch (e) {
      setError(
        controller.signal.aborted
          ? "Generation cancelled. Your draft and sources are kept."
          : (e as Error).message,
      );
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Leave yourself a little context."
      subtitle={`Save your place in ${project.name}. Future you will thank you.`}
      onClose={onClose}
      busy={busy}
      wide
    >
      <form onSubmit={save} className="capture-form">
        <div className="capture-note-heading">
          <h3>Where are you leaving off?</h3>
          <div className="note-mode" aria-label="Session note format">
            <button
              type="button"
              aria-pressed={draft.mode === "guided"}
              disabled={busy}
              onClick={() =>
                setDraft((previous) => ({ ...previous, mode: "guided" }))
              }
            >
              Guided note
            </button>
            <button
              type="button"
              aria-pressed={draft.mode === "free"}
              disabled={busy}
              onClick={() =>
                setDraft((previous) => ({ ...previous, mode: "free" }))
              }
            >
              Free note
            </button>
          </div>
        </div>
        {draft.mode === "guided" ? (
          <div className="guided-note">
            {SESSION_FIELDS.map(({ key, prompt, placeholder }) => (
              <label key={key}>
                {prompt}
                <textarea
                  aria-label={prompt}
                  rows={2}
                  maxLength={1000}
                  value={draft.fields[key]}
                  disabled={busy}
                  onChange={(e) =>
                    setDraft((previous) => ({
                      ...previous,
                      fields: { ...previous.fields, [key]: e.target.value },
                    }))
                  }
                  placeholder={placeholder}
                />
              </label>
            ))}
          </div>
        ) : (
          <label className="note-label">
            Session note
            <textarea
              aria-label="Session note"
              maxLength={6000}
              value={draft.note}
              disabled={busy}
              onChange={(e) =>
                setDraft((previous) => ({ ...previous, note: e.target.value }))
              }
              placeholder={
                "Goal: What are you trying to achieve?\nCompleted: What moved forward?\nBlocked: What is still in the way?\nTried: What didn’t work?\nNext idea: Where will you start?"
              }
              rows={6}
            />
          </label>
        )}
        <p className="draft-note">
          <LockKeyhole size={12} /> Your note, sources, and selections are kept
          in this browser until the card is saved.
        </p>
        {draftError && (
          <p className="form-error" role="alert">
            {draftError}
          </p>
        )}
        <div className="capture-sources-heading">
          <div>
            <h3>Bring the evidence</h3>
            <p>Notes, code, or a test log. Only selected sources are used.</p>
          </div>
          <div className="button-row">
            {project.rootPath && (
              <button
                type="button"
                className="button secondary small"
                onClick={scan}
                disabled={busy || scanning || importing}
              >
                {scanning ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <FolderOpen size={15} />
                )}
                Scan folder
              </button>
            )}
            <button
              className="button secondary small"
              type="button"
              onClick={() => input.current?.click()}
              disabled={busy || scanning || importing}
            >
              <Upload size={15} />
              Import files
            </button>
            <input
              aria-label="Import source files"
              ref={input}
              hidden
              type="file"
              multiple
              accept=".md,.txt,.log,.ts,.tsx,.js,.jsx,.json,.py,.rs,.go,.css,.html,.yaml,.yml"
              onChange={(e) => {
                void importFiles(e.target.files).catch(() =>
                  setError("Could not read a selected file. Please try again."),
                );
              }}
            />
          </div>
        </div>
        {project.sample && (
          <p className="sample-note">
            <Sparkles size={13} /> Fictional example sources are loaded. This
            run will use the real local model.
          </p>
        )}
        <div className="capture-source-list">
          {sources.length ? (
            sources.map((source) => (
              <div className="source-selection-row" key={source.id}>
                <label className="select-source">
                  <input
                    type="checkbox"
                    checked={selected.has(source.id)}
                    disabled={busy || scanning || importing}
                    onChange={(e) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(source.id);
                        else next.delete(source.id);
                        return next;
                      })
                    }
                  />
                  <SourceIcon source={source} />
                  <span>{source.name}</span>
                  <small>{source.content.length.toLocaleString()} chars</small>
                </label>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove ${source.name}`}
                  disabled={busy || scanning || importing}
                  onClick={() => {
                    setSources((items) =>
                      items.filter((s) => s.id !== source.id),
                    );
                    setSelected((ids) => {
                      const next = new Set(ids);
                      next.delete(source.id);
                      return next;
                    });
                  }}
                >
                  <X size={15} />
                </button>
              </div>
            ))
          ) : (
            <div className="source-empty">
              <FileText size={23} />
              <p>
                A short note is enough to start.
                <br />
                Add files when you need more context.
              </p>
            </div>
          )}
        </div>
        {warnings.length > 0 && (
          <div className="form-notice">
            {warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </div>
        )}
        <div
          className={`context-meter ${chars > 18000 || sourceCount > 20 || note.length > 6000 ? "over-limit" : ""}`}
        >
          <span>
            {selectedSources.length} selected sources
            {note.trim() ? " + your note" : ""}
          </span>
          <span>{chars.toLocaleString()} / 18,000 characters</span>
        </div>
        {sourceCount > 20 && (
          <p className="form-error" role="alert">
            Choose at most 20 sources, including your note.
          </p>
        )}
        {note.length > 6000 && (
          <p className="form-error" role="alert">
            Shorten your note to 6,000 characters.
          </p>
        )}
        {!status?.ready && (
          <div className="form-notice">
            Your local model is not ready. Start it with{" "}
            <code>npm run model</code> in the project folder. You can retry once
            it’s running.
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {busy && (
          <div className="generation-progress" role="status">
            <LoaderCircle className="spin" size={19} />
            <div>
              <strong>
                {elapsed < 15
                  ? "Reading the room…"
                  : elapsed < 40
                    ? "Finding the thread in your sources…"
                    : "Giving future you a useful starting point…"}
              </strong>
              <span>
                Working on your device · {elapsed}s · you can leave this window
                open
              </span>
            </div>
          </div>
        )}
        <div className="modal-footer">
          <span>
            <LockKeyhole size={13} /> Your sources stay on this device
          </span>
          {busy && (
            <button
              type="button"
              className="button secondary"
              onClick={() => generation.current?.abort()}
            >
              Cancel generation
            </button>
          )}
          <button
            className="button primary"
            type="submit"
            disabled={
              busy ||
              scanning ||
              importing ||
              chars > 18000 ||
              note.length > 6000 ||
              !sourceCount ||
              sourceCount > 20
            }
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Pause size={16} />
            )}{" "}
            {busy ? "Saving your place…" : "Create resume card"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]),
    [activeId, setActiveId] = useState(
      (() => {
        try {
          return localStorage.getItem("resume-project") ?? "";
        } catch {
          return "";
        }
      })(),
    );
  const [detail, setDetail] = useState<ProjectDetail | null>(null),
    [snapshotId, setSnapshotId] = useState("");
  const [status, setStatus] = useState<ModelStatus | null>(null),
    [tab, setTab] = useState<"card" | "sources" | "history">("card");
  const [dialog, setDialog] = useState<
      | "create"
      | "capture"
      | "settings"
      | "edit"
      | "delete-project"
      | "delete-card"
      | null
    >(null),
    [viewSource, setViewSource] = useState<{
      source: Source;
      line?: number;
    } | null>(null);
  const [toast, setToast] = useState(""),
    [loadError, setLoadError] = useState(""),
    [query, setQuery] = useState(""),
    [menuOpen, setMenuOpen] = useState(false);
  const [focusStart, setFocusStart] = useState<number | null>(null),
    [focusSeconds, setFocusSeconds] = useState(0);
  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await api<ModelStatus>("/api/status"));
    } catch {
      setStatus(null);
    }
  }, []);
  const refreshProjects = useCallback(async () => {
    const items = await api<Project[]>("/api/projects");
    setProjects(items);
    return items;
  }, []);
  useEffect(() => {
    void refreshProjects()
      .then((items) => {
        if (!items.some((p) => p.id === activeRef.current))
          setActiveId(items[0]?.id ?? "");
      })
      .catch((e) => setLoadError(e.message));
    void refreshStatus();
    const timer = setInterval(refreshStatus, 30_000);
    return () => clearInterval(timer);
  }, [refreshProjects, refreshStatus]);
  useEffect(() => {
    if (!activeId) {
      setDetail(null);
      setSnapshotId("");
      return;
    }
    try {
      localStorage.setItem("resume-project", activeId);
    } catch {
      /* The server still retains saved work. */
    }
    setDetail(null);
    setLoadError("");
    setTab("card");
    setFocusStart(null);
    const controller = new AbortController();
    void api<ProjectDetail>(`/api/projects/${activeId}`, {
      signal: controller.signal,
    })
      .then((data) => {
        setDetail(data);
        setSnapshotId(data.snapshots[0]?.id ?? "");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setLoadError(e.message);
      });
    return () => controller.abort();
  }, [activeId]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!focusStart) return;
    setFocusSeconds(0);
    const timer = setInterval(
      () => setFocusSeconds(Math.floor((Date.now() - focusStart) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [focusStart]);
  const project = detail?.project;
  const snapshot =
    detail?.snapshots.find((s) => s.id === snapshotId) ?? detail?.snapshots[0];
  const card = snapshot?.card;
  const openSource = (source: Source, line?: number) =>
    setViewSource({ source, line });
  const capture = () => {
    setDialog("capture");
    void refreshStatus();
  };
  async function saved(newSnapshot: Snapshot) {
    setDialog(null);
    setFocusStart(null);
    setSnapshotId(newSnapshot.id);
    setTab("card");
    setDetail((prev) =>
      prev
        ? {
            project: {
              ...prev.project,
              snapshotCount: prev.project.snapshotCount + 1,
              updatedAt: newSnapshot.createdAt,
            },
            snapshots: [newSnapshot, ...prev.snapshots],
          }
        : null,
    );
    setToast("Your place is saved. Go take that break.");
    void refreshProjects().catch(() => {});
  }
  const [actionBusy, setActionBusy] = useState(false),
    [actionError, setActionError] = useState("");
  async function remove() {
    if (!project) return;
    setActionBusy(true);
    setActionError("");
    try {
      if (dialog === "delete-project") {
        await api(`/api/projects/${project.id}`, {
          method: "DELETE",
          body: "{}",
        });
        try {
          localStorage.removeItem(`resume-draft-${project.id}`);
        } catch {
          /* Optional browser cleanup. */
        }
        const items = await refreshProjects();
        setActiveId(items[0]?.id ?? "");
        setToast("Project removed.");
      } else if (snapshot) {
        await api(`/api/projects/${project.id}/snapshots/${snapshot.id}`, {
          method: "DELETE",
          body: "{}",
        });
        const data = await api<ProjectDetail>(`/api/projects/${project.id}`);
        setDetail(data);
        setSnapshotId(data.snapshots[0]?.id ?? "");
        setFocusStart(null);
        await refreshProjects();
        setToast("Card removed.");
      }
      setDialog(null);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Could not remove this item.",
      );
    } finally {
      setActionBusy(false);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setToast("Copied to clipboard.");
    } catch {
      setToast("Clipboard is unavailable. Select and copy the text instead.");
    }
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <a className="brand" href="/" aria-label="Resume Button home">
          <span className="brand-mark">
            <span />
            <Play size={20} fill="currentColor" />
          </span>
          <span>
            resume<span className="brand-period">.</span>
          </span>
        </a>
        <div className="sidebar-caption">LESS CATCHING UP. MORE DOING.</div>
        <div className="workspace-label">
          WORKSPACE<span>Local</span>
        </div>
        <button
          className={`nav-item ${tab !== "history" ? "active" : ""}`}
          onClick={() => {
            setTab("card");
            setMenuOpen(false);
          }}
        >
          <PanelLeft size={18} />
          Your desk
          <ChevronRight size={15} />
        </button>
        <button
          className={`nav-item ${tab === "history" ? "active" : ""}`}
          onClick={() => {
            setTab("history");
            setMenuOpen(false);
          }}
        >
          <History size={18} />
          Session history
          {project && (
            <span className="nav-count">{detail?.snapshots.length}</span>
          )}
        </button>
        <div className="project-label">
          YOUR PROJECTS
          <button
            aria-label="Add project"
            className="icon-button"
            onClick={() => setDialog("create")}
          >
            <Plus size={16} />
          </button>
        </div>
        <label className="project-search">
          <Search size={14} />
          <input
            aria-label="Find a project"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a project"
          />
        </label>
        <div className="project-list">
          {projects
            .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
            .map((p) => (
              <button
                key={p.id}
                className={`project-item ${activeId === p.id ? "selected" : ""}`}
                onClick={() => {
                  setActiveId(p.id);
                  setMenuOpen(false);
                }}
              >
                <span
                  className={`project-dot ${p.sample ? "sample-dot" : ""}`}
                />
                <span>{p.name}</span>
                {p.sample && <span className="mini-label">demo</span>}
              </button>
            ))}
          {query &&
            !projects.some((p) =>
              p.name.toLowerCase().includes(query.toLowerCase()),
            ) && <p className="no-projects">No projects found.</p>}
        </div>
        <button className="new-project" onClick={() => setDialog("create")}>
          <Plus size={16} />
          New project
        </button>
        <div className="sidebar-bottom">
          <div className="local-note">
            <Leaf size={19} />
            <strong>A quieter kind of productivity.</strong>
            <p>
              Close the tabs. Take the break.
              <br />
              We’ll keep your place.
            </p>
          </div>
          <button
            className="model-status"
            onClick={() => {
              setDialog("settings");
              void refreshStatus();
            }}
          >
            <span className={`status-dot ${status?.ready ? "ready" : ""}`} />
            <span>
              <strong>
                {status?.ready ? "Local model ready" : "Local model offline"}
              </strong>
              <small>Private by default</small>
            </span>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>
      {menuOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <main className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenuOpen(true)}
            >
              <PanelLeft size={20} />
            </button>
            <span>Your workspace</span>
            <ChevronRight size={13} />
            <strong>{project?.name ?? "Your desk"}</strong>
          </div>
          <div className="topbar-right">
            <span>
              <LockKeyhole size={13} /> On your device
            </span>
            <span className="avatar">Y</span>
          </div>
        </header>
        <div className="main-content">
          <section className="hero">
            <div>
              <div className="eyebrow">
                <span className="tiny-line" />
                YOUR NEXT CHAPTER STARTS HERE
              </div>
              <h1>
                A little context.
                <br />
                <em>A softer landing.</em>
              </h1>
              <p>
                Pick up where you left off. Keep the momentum, skip the recap.
              </p>
            </div>
            <div className="hero-art" aria-hidden="true">
              <span className="orbit orbit-one" />
              <span className="orbit orbit-two" />
              <span className="orbit-dot" />
              <div className="hero-play">
                <Pause size={20} />
                <span />
                <Play size={24} fill="currentColor" />
              </div>
              <span className="art-caption">right where you left off</span>
            </div>
          </section>
          <div className="project-heading">
            <div className="project-heading-title">
              <span className="folder-badge">
                <FolderOpen size={21} />
              </span>
              <div>
                <h2>
                  {project?.name ?? "Your workspace"}
                  {project?.sample && (
                    <span className="sample-tag">Example project</span>
                  )}
                </h2>
                <p>
                  {project?.description || "A home for your unfinished work."}
                </p>
              </div>
            </div>
            {project && (
              <button
                className="icon-button"
                aria-label="Edit project"
                onClick={() => setDialog("edit")}
              >
                <Settings2 size={18} />
              </button>
            )}
            <button
              className="button primary"
              onClick={project ? capture : () => setDialog("create")}
            >
              <Pause size={16} />
              {project ? "Save my place" : "New project"}
            </button>
          </div>
          {focusStart && (
            <div className="focus-banner" role="status">
              <span className="status-dot ready" />
              <strong>You’re back in it.</strong>
              <span>
                Focus session ·{" "}
                {Math.floor(focusSeconds / 60)
                  .toString()
                  .padStart(2, "0")}
                :{(focusSeconds % 60).toString().padStart(2, "0")}
              </span>
              <button onClick={capture}>
                Save & take a break <ArrowRight size={14} />
              </button>
            </div>
          )}
          <div className="content-tabs">
            <div>
              {(["card", "sources", "history"] as const).map((t) => (
                <button
                  key={t}
                  aria-pressed={tab === t}
                  className={tab === t ? "tab-active" : ""}
                  onClick={() => setTab(t)}
                >
                  {t === "card"
                    ? "Resume card"
                    : t === "sources"
                      ? "Sources"
                      : "History"}
                  {t === "sources" && snapshot && (
                    <span>{snapshot.sources.length}</span>
                  )}
                  {t === "history" && detail && (
                    <span>{detail.snapshots.length}</span>
                  )}
                </button>
              ))}
            </div>
            {snapshot && (
              <span className="capture-time">
                <Clock3 size={13} /> Saved {date(snapshot.createdAt, true)}
              </span>
            )}
          </div>
          {loadError ? (
            <div className="empty-panel">
              <CircleHelp size={30} />
              <h3>Couldn’t open your desk.</h3>
              <p>{loadError}</p>
              <button
                className="button secondary"
                onClick={() => location.reload()}
              >
                Try again
              </button>
            </div>
          ) : !detail && activeId ? (
            <div className="loading-panel" role="status">
              <LoaderCircle className="spin" />
              Opening your desk…
            </div>
          ) : tab === "history" ? (
            <section className="history-panel">
              <div className="section-intro">
                <History size={22} />
                <div>
                  <h3>Every stopping point, kept.</h3>
                  <p>Open a previous card to see exactly what you knew then.</p>
                </div>
              </div>
              {detail?.snapshots.length ? (
                detail.snapshots.map((s, i) => (
                  <button
                    className="history-row"
                    key={s.id}
                    onClick={() => {
                      setSnapshotId(s.id);
                      setTab("card");
                    }}
                  >
                    <div className="history-icon">
                      <Pause size={16} />
                    </div>
                    <div>
                      <strong>
                        {i === 0
                          ? "Latest stopping point"
                          : date(s.createdAt, true)}
                      </strong>
                      <p>{s.card.recap}</p>
                      <small>
                        {date(s.createdAt, true)} · {s.sources.length} sources ·{" "}
                        {s.mode === "example" ? "Handwritten example" : s.model}
                      </small>
                    </div>
                    <ArrowRight size={19} />
                  </button>
                ))
              ) : (
                <div className="source-empty">
                  <p>Your first card will start the story.</p>
                </div>
              )}
            </section>
          ) : !snapshot ? (
            <div className="empty-panel">
              <div className="empty-icon">
                <Pause size={28} />
              </div>
              <h3>Give future you a head start.</h3>
              <p>
                Leave a note, add a few files, and let your local model
                <br />
                turn the loose ends into a useful starting point.
              </p>
              <button className="button primary" onClick={capture}>
                <Plus size={17} />
                Create your first card
              </button>
            </div>
          ) : tab === "sources" ? (
            <section className="sources-panel">
              <div className="section-intro">
                <Folder size={23} />
                <div>
                  <h3>The context behind this card.</h3>
                  <p>
                    These are saved copies. New cards use only the sources you
                    select.
                  </p>
                </div>
              </div>
              {snapshot.sources.map((source) => (
                <button
                  className="source-table-row"
                  key={source.id}
                  onClick={() => openSource(source)}
                >
                  <span className="file-icon">
                    <SourceIcon source={source} size={20} />
                  </span>
                  <span>
                    <strong>{source.name}</strong>
                    <small>
                      {source.kind} · {source.content.split("\n").length} lines
                    </small>
                  </span>
                  <span className="source-size">
                    {source.content.length.toLocaleString()} characters
                  </span>
                  <ChevronRight size={17} />
                </button>
              ))}
            </section>
          ) : (
            card && (
              <div className="desk-grid">
                <article className="resume-card">
                  <div className="card-heading">
                    <span className="eyebrow">YOUR LAST STOPPING POINT</span>
                    <span className="card-state">
                      <span />
                      In progress
                    </span>
                  </div>
                  {snapshot.id !== detail?.snapshots[0]?.id && (
                    <div className="historical-notice">
                      <History size={14} />
                      You’re viewing an older card.
                      <button
                        onClick={() => setSnapshotId(detail!.snapshots[0].id)}
                      >
                        Return to latest
                      </button>
                    </div>
                  )}
                  <h3>{card.recap}</h3>
                  <div className="recap-meta">
                    <Sparkles size={12} />
                    {snapshot.mode === "example"
                      ? "Handwritten example · fictional project"
                      : `${card.recapOrigin === "evidence" ? "Recap from selected evidence" : "AI recap"} · ${snapshot.model}`}
                  </div>
                  {card.goal.length > 0 && (
                    <div className="goal-strip">
                      <span>THE GOAL</span>
                      {card.goal.map((e, i) => (
                        <Quote
                          key={i}
                          evidence={e}
                          sources={snapshot.sources}
                          onOpen={openSource}
                        />
                      ))}
                    </div>
                  )}
                  <div className="card-columns">
                    <section className="progress-section">
                      <div className="section-label">
                        <span className="label-icon green">
                          <CheckCheck size={16} />
                        </span>
                        <h4>What moved forward</h4>
                      </div>
                      {card.progress.length ? (
                        card.progress.map((e, i) => (
                          <div className="progress-item" key={i}>
                            <Check size={14} />
                            <Quote
                              evidence={e}
                              sources={snapshot.sources}
                              onOpen={openSource}
                            />
                          </div>
                        ))
                      ) : (
                        <p className="nothing-captured">
                          No completed work explicitly captured.
                        </p>
                      )}
                    </section>
                    <section className="blocker-section">
                      <div className="section-label">
                        <span className="label-icon amber">
                          <MoreHorizontal size={17} />
                        </span>
                        <h4>Still in the way</h4>
                      </div>
                      {card.blockers.length ? (
                        card.blockers.map((e, i) => (
                          <Quote
                            key={i}
                            evidence={e}
                            sources={snapshot.sources}
                            onOpen={openSource}
                          />
                        ))
                      ) : (
                        <p className="nothing-captured">
                          No blocker explicitly captured.
                        </p>
                      )}
                    </section>
                  </div>
                  <section className="attempts-section">
                    <div className="section-label">
                      <History size={15} />
                      <h4>Already tried</h4>
                      <span>Save yourself the loop</span>
                    </div>
                    {card.attempts.length ? (
                      card.attempts.map((e, i) => (
                        <Quote
                          key={i}
                          evidence={e}
                          sources={snapshot.sources}
                          onOpen={openSource}
                        />
                      ))
                    ) : (
                      <p className="nothing-captured">
                        No failed approach recorded in these sources.
                      </p>
                    )}
                  </section>
                  {card.nextStep ? (
                    <section className="next-step">
                      <div className="next-step-top">
                        <span>
                          <span className="small-play">
                            <Play size={11} fill="currentColor" />
                          </span>{" "}
                          ONE SMALL NEXT STEP
                        </span>
                        <span>
                          {card.nextStep.origin === "author"
                            ? "Your recorded idea"
                            : "AI suggestion"}
                        </span>
                      </div>
                      <h4>{card.nextStep.title}</h4>
                      {card.nextStep.detail !== card.nextStep.title && (
                        <p>{card.nextStep.detail}</p>
                      )}
                      <div
                        className="next-step-sources"
                        aria-label="Sources supporting the next step"
                      >
                        {(card.nextStep.evidence?.length
                          ? card.nextStep.evidence
                          : card.nextStep.sourceIds.map((sourceId) => ({
                              sourceId,
                              line: undefined,
                            }))
                        ).map((e, i) => {
                          const source = snapshot.sources.find(
                            (s) => s.id === e.sourceId,
                          );
                          return source ? (
                            <button
                              key={i}
                              className="source-link"
                              onClick={() => openSource(source, e.line)}
                            >
                              <SourceIcon source={source} size={12} />
                              <span>{source.name}</span>
                              {e.line && (
                                <span className="line-label">L{e.line}</span>
                              )}
                              <ChevronRight size={12} />
                            </button>
                          ) : null;
                        })}
                      </div>
                      <div className="next-step-footer">
                        <button
                          className="button cream"
                          onClick={() => {
                            setFocusStart(Date.now());
                            setToast(
                              "One small step. You’ve got your context.",
                            );
                          }}
                          disabled={Boolean(focusStart)}
                        >
                          {focusStart ? (
                            <Check size={15} />
                          ) : (
                            <Play size={14} fill="currentColor" />
                          )}
                          {focusStart
                            ? "Session in progress"
                            : "Let’s pick this up"}
                        </button>
                        <button
                          className="copy-step"
                          onClick={() =>
                            copy(
                              `${card.nextStep!.title}\n${card.nextStep!.detail}`,
                            )
                          }
                          aria-label="Copy suggested next step"
                        >
                          <Copy size={15} />
                        </button>
                      </div>
                    </section>
                  ) : (
                    <div className="form-notice">
                      There isn’t enough context to suggest a next step. Add a
                      short note when you save your place.
                    </div>
                  )}
                  {card.discardedQuotes > 0 && (
                    <p className="quote-warning">
                      {card.discardedQuotes} unsupported or miscategorized model
                      selection(s) were left out.
                    </p>
                  )}
                  <div className="card-management">
                    <button
                      onClick={() => {
                        setActionError("");
                        setDialog("delete-card");
                      }}
                    >
                      <Trash2 size={13} />
                      Remove this card
                    </button>
                  </div>
                  <footer className="card-footer">
                    <span>
                      <ShieldCheck size={14} /> Quotes linked to saved sources
                    </span>
                    <a
                      href={`/api/projects/${project!.id}/snapshots/${snapshot.id}/export`}
                      download
                    >
                      <ArrowDownToLine size={14} />
                      Export card
                    </a>
                  </footer>
                </article>
                <aside className="context-column">
                  <section className="context-box">
                    <div className="context-box-heading">
                      <h3>Context, kept close.</h3>
                      <span>{snapshot.sources.length}</span>
                    </div>
                    <p>The breadcrumbs behind your card.</p>
                    <div className="context-files">
                      {snapshot.sources.slice(0, 6).map((source) => (
                        <button
                          key={source.id}
                          onClick={() => openSource(source)}
                        >
                          <span className="file-icon">
                            <SourceIcon source={source} />
                          </span>
                          <span>
                            {source.name}
                            <small>
                              {source.content.split("\n").length} lines captured
                            </small>
                          </span>
                          <ChevronRight size={14} />
                        </button>
                      ))}
                    </div>
                    <button
                      className="view-all"
                      onClick={() => setTab("sources")}
                    >
                      View all sources
                      <ArrowRight size={14} />
                    </button>
                  </section>
                  {card.questions.length > 0 && (
                    <section className="question-box">
                      <CircleHelp size={19} />
                      <h3>One thing to think about</h3>
                      {card.questions.map((q, i) => (
                        <p key={i}>{q}</p>
                      ))}
                      <span>No need to solve it all right now.</span>
                    </section>
                  )}
                  <div className="quiet-note">
                    <Leaf size={17} />
                    <p>
                      Progress doesn’t have to be loud.
                      <br />
                      Sometimes it’s knowing where to start.
                    </p>
                  </div>
                </aside>
              </div>
            )
          )}
          <footer className="page-footer">
            <span>
              <LockKeyhole size={12} />
              Local storage. Local intelligence. Your pace.
            </span>
            <span>Made for the unfinished things.</span>
          </footer>
        </div>
      </main>
      {dialog === "create" && (
        <CreateProject
          onClose={() => setDialog(null)}
          onCreated={(p) => {
            setProjects((prev) => [...prev, p]);
            setActiveId(p.id);
            setDialog(null);
            setMenuOpen(false);
            setToast("A fresh place for your project.");
          }}
        />
      )}
      {dialog === "edit" && project && (
        <CreateProject
          project={project}
          onClose={() => setDialog(null)}
          onCreated={(p) => {
            setDetail((previous) =>
              previous ? { ...previous, project: p } : null,
            );
            setDialog(null);
            void refreshProjects();
            setToast("Project updated.");
          }}
        />
      )}
      {(dialog === "delete-project" || dialog === "delete-card") && (
        <Modal
          title={
            dialog === "delete-project"
              ? "Remove this project?"
              : "Remove this card?"
          }
          onClose={() => setDialog(null)}
          busy={actionBusy}
        >
          <div className="form-stack">
            <p className="delete-description">
              {dialog === "delete-project"
                ? `This removes ${project?.name} and its ${project?.snapshotCount ?? 0} saved card(s) from Resume Button. Files in your project folder stay in place.`
                : "This removes the selected card and its saved source copies. Other cards stay available."}
            </p>
            <a className="button secondary small" href="/api/backup" download>
              Download a backup first
            </a>
            {actionError && (
              <p className="form-error" role="alert">
                {actionError}
              </p>
            )}
            <div className="modal-footer">
              <button
                className="button secondary"
                disabled={actionBusy}
                onClick={() => setDialog(null)}
              >
                Keep it
              </button>
              <button
                className="button danger"
                disabled={actionBusy}
                onClick={remove}
              >
                {actionBusy
                  ? "Removing…"
                  : dialog === "delete-project"
                    ? "Remove project"
                    : "Remove card"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {dialog === "capture" && project && (
        <Capture
          project={project}
          exampleSources={
            detail?.snapshots.find((s) => s.mode === "example")?.sources ?? []
          }
          status={status}
          onClose={() => setDialog(null)}
          onSaved={saved}
        />
      )}
      {dialog === "settings" && (
        <Modal
          title="Your intelligence. Your device."
          subtitle="Resume Button connects only to a model running on this computer."
          onClose={() => setDialog(null)}
        >
          <div className="settings-content">
            <BackupPanel
              onRestored={() => {
                void refreshProjects().then((items) => {
                  if (!activeRef.current) setActiveId(items[0]?.id ?? "");
                });
              }}
            />
            {project && (
              <section className="project-management">
                <h3>{project.name}</h3>
                <div className="button-row">
                  <button
                    className="button secondary small"
                    onClick={() => setDialog("edit")}
                  >
                    Edit project
                  </button>
                  <button
                    className="button danger small"
                    onClick={() => {
                      setActionError("");
                      setDialog("delete-project");
                    }}
                  >
                    <Trash2 size={14} />
                    Remove project
                  </button>
                </div>
              </section>
            )}
            <div className="settings-status">
              <span className={`status-dot ${status?.ready ? "ready" : ""}`} />
              <div>
                <strong>
                  {status?.message ?? "App connection unavailable"}
                </strong>
                <p>
                  {status?.model ?? "Model not connected"} ·{" "}
                  {status?.provider ?? "local"}
                </p>
              </div>
              <button
                className="button secondary small"
                onClick={refreshStatus}
              >
                Refresh
              </button>
            </div>
            <h3>Start the local model</h3>
            <p>In this project’s terminal, run:</p>
            <div className="command-box">
              <code>npm run model</code>
              <button
                aria-label="Copy model command"
                onClick={() => copy("npm run model")}
              >
                <Copy size={15} />
              </button>
            </div>
            <p className="settings-small">
              First time? Run <code>npm run setup:model</code> to download the
              portable runtime and Qwen weights (about 1.1 GB). Internet is
              needed for setup; generation works offline afterward.
            </p>
            <div className="privacy-box">
              <LockKeyhole size={20} />
              <div>
                <strong>Your context stays close.</strong>
                <p>
                  Sources and cards are stored in a local SQLite file. No cloud
                  generation, accounts, or analytics. Local files are not
                  encrypted by this app.
                </p>
              </div>
            </div>
            <p className="settings-small">
              The example card is handwritten. New cards use the actual local
              model. New recaps use selected source text. Your recorded next
              idea takes precedence; other categorization and suggestions come
              from the model and can still be wrong.
            </p>
          </div>
        </Modal>
      )}
      {viewSource && (
        <SourceViewer {...viewSource} onClose={() => setViewSource(null)} />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
