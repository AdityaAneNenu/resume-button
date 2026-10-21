export const SESSION_FIELDS = [
  {
    key: "goal",
    label: "Goal",
    prompt: "What are you trying to achieve?",
    placeholder: "Make destination search show the latest query.",
  },
  {
    key: "progress",
    label: "Completed",
    prompt: "What moved forward?",
    placeholder: "Connected the search input to the API.",
  },
  {
    key: "blocker",
    label: "Blocked",
    prompt: "What is still in the way?",
    placeholder: "Older responses sometimes replace newer results.",
  },
  {
    key: "attempts",
    label: "Tried",
    prompt: "What did you try that didn’t work?",
    placeholder: "A debounce reduced requests but didn’t fix the ordering.",
  },
  {
    key: "next",
    label: "Next idea",
    prompt: "Your next idea",
    placeholder: "Track the latest request ID before showing results.",
  },
  {
    key: "question",
    label: "Open question",
    prompt: "An unresolved decision",
    placeholder: "Should old requests also be cancelled?",
  },
] as const;

export type SessionField = (typeof SESSION_FIELDS)[number]["key"];
export type SessionDraft = {
  mode: "guided" | "free";
  note: string;
  fields: Record<SessionField, string>;
};

export function emptyDraft(): SessionDraft {
  return {
    mode: "guided",
    note: "",
    fields: {
      goal: "",
      progress: "",
      blocker: "",
      attempts: "",
      next: "",
      question: "",
    },
  };
}

export type CaptureDraft = SessionDraft & {
  restoredSources: boolean;
  sources: import("./types").Source[];
  selected: string[];
  scanned: string[];
};
export function restoreCapture(value: string | null): CaptureDraft {
  const draft: CaptureDraft = {
    ...restoreDraft(value),
    restoredSources: false,
    sources: [],
    selected: [],
    scanned: [],
  };
  try {
    const parsed = JSON.parse(value ?? "{}");
    if (Array.isArray(parsed.sources)) {
      draft.restoredSources = true;
      draft.sources = parsed.sources.filter(
        (s: any) =>
          s &&
          typeof s.id === "string" &&
          typeof s.name === "string" &&
          typeof s.content === "string" &&
          s.id.length <= 100 &&
          s.name.length <= 240 &&
          s.content.length <= 6000 &&
          ["file", "note", "log", "git"].includes(s.kind),
      );
    }
    const ids = new Set(draft.sources.map((s) => s.id));
    draft.sources = draft.sources.filter(
      (s, i, items) => items.findIndex((item) => item.id === s.id) === i,
    );
    if (Array.isArray(parsed.selected))
      draft.selected = parsed.selected.filter(
        (id: unknown) => typeof id === "string" && ids.has(id),
      );
    if (Array.isArray(parsed.scanned))
      draft.scanned = parsed.scanned.filter(
        (id: unknown) => typeof id === "string" && ids.has(id),
      );
  } catch {
    /* Preserve the usable note even if source metadata is damaged. */
  }
  return draft;
}
export function restoreDraft(value: string | null): SessionDraft {
  const draft = emptyDraft();
  if (!value) return draft;
  try {
    const parsed = JSON.parse(value);
    if (parsed.mode === "free") draft.mode = "free";
    if (typeof parsed.note === "string")
      draft.note = parsed.note.slice(0, 6000);
    for (const { key } of SESSION_FIELDS)
      if (typeof parsed.fields?.[key] === "string")
        draft.fields[key] = parsed.fields[key].slice(0, 1000);
  } catch {
    /* A damaged draft should not prevent opening the capture form. */
  }
  return draft;
}

export function sessionNote(draft: SessionDraft): string {
  if (draft.mode === "free") return draft.note.trim();
  return SESSION_FIELDS.flatMap(({ key, label }) =>
    draft.fields[key]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `${label}: ${line}`),
  ).join("\n");
}
