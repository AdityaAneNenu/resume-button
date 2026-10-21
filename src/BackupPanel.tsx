import { useRef, useState } from "react";
import { ArrowDownToLine, Upload } from "lucide-react";

export function BackupPanel({ onRestored }: { onRestored: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function inspect(file?: File) {
    setError("");
    setMessage("");
    setPending(null);
    if (!file) return;
    try {
      if (file.size > 10_000_000)
        throw new Error("Choose a backup smaller than 10 MB.");
      const data = JSON.parse(await file.text());
      if (
        data.format !== "resume-button" ||
        data.version !== 1 ||
        !Array.isArray(data.projects)
      )
        throw new Error("This is not a supported Resume Button backup.");
      setPending(data);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not read that backup.",
      );
    }
    if (input.current) input.current.value = "";
  }
  async function restore() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage(
        `Restored ${data.projects} project(s) and ${data.snapshots} card(s).`,
      );
      setPending(null);
      onRestored();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Restore failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="backup-panel">
      <h3>A copy you can keep.</h3>
      <p>
        Download projects, cards, and captured sources. Backups contain your
        saved text in plain JSON. Folder attachments and browser drafts stay on
        this device.
      </p>
      <div className="button-row">
        <a className="button secondary small" href="/api/backup" download>
          <ArrowDownToLine size={15} />
          Download backup
        </a>
        <button
          className="button secondary small"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Upload size={15} />
          Import backup
        </button>
        <input
          ref={input}
          hidden
          type="file"
          accept=".json"
          aria-label="Import backup file"
          onChange={(e) => void inspect(e.target.files?.[0])}
        />
      </div>
      {pending && (
        <div className="form-notice">
          <p>
            Restore {pending.projects.length} project(s) as new copies. Existing
            projects and cards are kept. Attach folders again after restoring.
          </p>
          <div className="button-row">
            <button
              className="button primary small"
              disabled={busy}
              onClick={restore}
            >
              {busy ? "Restoring…" : "Restore copies"}
            </button>
            <button
              className="button secondary small"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              Cancel import
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="backup-success" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
