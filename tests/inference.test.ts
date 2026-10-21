import test from "node:test";
import assert from "node:assert/strict";
import { resolveInference, sourceLines } from "../server/inference.js";
import { SAMPLE_SOURCES } from "../server/sample.js";
import { emptyDraft, restoreDraft, sessionNote } from "../shared/session.js";
import { toMarkdown } from "../server/cards.js";
import type { Source } from "../shared/types.js";

const output = () => ({
  goal: [] as number[],
  progress: [] as number[],
  blockers: [] as number[],
  attempts: [] as number[],
  nextStep: null as null | {
    title: string;
    detail: string;
    evidence: number[];
  },
  questions: [] as number[],
});

test("author labels correct model misclassification and recaps cannot invent completed work", () => {
  const card = resolveInference(
    {
      ...output(),
      goal: [3],
      progress: [1],
      blockers: [4],
      attempts: [3],
      recap: "Everything is fixed.",
    },
    SAMPLE_SOURCES,
  );
  assert.match(card.goal[0].quote, /^Goal:/);
  assert.equal(card.progress.length, 2);
  assert.match(card.blockers[0].quote, /^Blocked:/);
  assert.match(card.attempts[0].quote, /^Tried:/);
  assert.ok(card.discardedQuotes > 0);
  assert.match(card.recap, /Still open: Typing/);
  assert.doesNotMatch(card.recap, /Everything is fixed/);
});

test("latest session labels and next idea override old notes and incorrect model suggestions", () => {
  const newest: Source = {
    id: "newest",
    name: "Session note",
    kind: "note",
    content:
      "Goal: Keep searches current.\nCompleted: Added a request guard.\nBlocked: Clearing the query still leaves old results.\nTried: Resetting loading did not clear results.\nNext idea: Clear destinations when the query is empty.",
  };
  const card = resolveInference(
    {
      ...output(),
      nextStep: {
        title: "Add another debounce.",
        detail: "Repeat the old approach.",
        evidence: [99999],
      },
    },
    [...SAMPLE_SOURCES, newest],
  );
  for (const group of ["goal", "progress", "blockers", "attempts"] as const)
    assert.equal(card[group][0].sourceId, "newest");
  assert.equal(card.nextStep?.origin, "author");
  assert.equal(
    card.nextStep?.detail,
    "Clear destinations when the query is empty.",
  );
  assert.deepEqual(card.nextStep?.evidence, [
    {
      sourceId: "newest",
      quote: "Next idea: Clear destinations when the query is empty.",
      line: 5,
    },
  ]);
});

test("unlabelled evidence is selected by the model, and unknown IDs are discarded", () => {
  const sources: Source[] = [
    {
      id: "log",
      name: "tests.log",
      kind: "log",
      content:
        "PASS search renders results\nFAIL query clearing removes results",
    },
  ];
  const raw = {
    ...output(),
    progress: [1, 1, 999],
    blockers: [2],
    nextStep: {
      title: "Clear the empty query.",
      detail: "Check the branch handling an empty query.",
      evidence: [2],
    },
  };
  const card = resolveInference(raw, sources);
  assert.equal(card.progress.length, 1);
  assert.equal(card.discardedQuotes, 1);
  assert.equal(card.nextStep?.origin, "model");
  assert.equal(card.nextStep?.evidence?.[0].line, 2);
  assert.match(card.recap, /Still open: FAIL/);
});

test("single-paragraph notes expose exact sentence evidence and logs cannot swap PASS and FAIL", () => {
  const sources: Source[] = [
    {
      id: "note",
      name: "note.txt",
      kind: "note",
      content:
        "I connected the export button. The date column is still missing. Changing the filename did not fix it.",
    },
    {
      id: "log",
      name: "test.log",
      kind: "log",
      content: "PASS downloads a CSV\nFAIL includes the date column",
    },
  ];
  const lines = sourceLines(sources);
  assert.equal(lines.length, 5);
  assert.equal(lines[1].quote, "The date column is still missing.");
  assert.equal(lines[1].line, 1);
  const card = resolveInference(
    {
      ...output(),
      progress: [5],
      blockers: [4],
      attempts: [3],
      questions: [2, 999],
      nextStep: {
        title: "Add the date field.",
        detail: "Update the CSV field mapping.",
        evidence: [2, 5],
      },
    },
    sources,
  );
  assert.equal(card.progress[0].quote, "PASS downloads a CSV");
  assert.equal(card.blockers[0].quote, "FAIL includes the date column");
  assert.deepEqual(card.questions, []);
  assert.equal(card.discardedQuotes, 4);
});

test("an unsupported card or next step cannot be saved", () => {
  const sources: Source[] = [
    {
      id: "log",
      name: "tests.log",
      kind: "log",
      content: "FAIL query clearing removes results",
    },
  ];
  assert.throws(
    () =>
      resolveInference({ ...output(), goal: [999] }, [
        { ...sources[0], kind: "file" },
      ]),
    /No source evidence/,
  );
  assert.throws(
    () => resolveInference({ ...output(), blockers: [1] }, sources),
    /concrete nextStep/,
  );
  assert.throws(
    () =>
      resolveInference(
        {
          ...output(),
          blockers: [1],
          nextStep: { title: "Fix it.", detail: "Check it.", evidence: [999] },
        },
        sources,
      ),
    /unknown line/,
  );
});

test("source line numbers and quote prefixes remain exact after blank lines and long text", () => {
  const sources: Source[] = [
    {
      id: "s",
      name: "notes.md",
      kind: "note",
      content: "\n\nCompleted: " + "x".repeat(600),
    },
  ];
  const lines = sourceLines(sources);
  assert.equal(lines[0].line, 3);
  assert.equal(lines[0].quote.length, 500);
  assert.equal(lines[0].quote, sources[0].content.split("\n")[2].slice(0, 500));
});

test("guided notes label every nonempty line and persist both note modes", () => {
  const draft = emptyDraft();
  draft.fields.progress = "Added loading.\n\nAdded empty state.";
  draft.fields.blocker = " Stale responses still win. ";
  draft.fields.next = "Guard the request ID.";
  assert.equal(
    sessionNote(draft),
    "Completed: Added loading.\nCompleted: Added empty state.\nBlocked: Stale responses still win.\nNext idea: Guard the request ID.",
  );
  assert.deepEqual(restoreDraft(JSON.stringify(draft)), draft);
  draft.mode = "free";
  draft.note = "  A free note.  ";
  assert.equal(
    sessionNote(restoreDraft(JSON.stringify(draft))),
    "A free note.",
  );
  assert.deepEqual(restoreDraft("{broken"), emptyDraft());
});

test("exports distinguish recorded ideas from AI suggestions and include their source locations", () => {
  const card = resolveInference(output(), SAMPLE_SOURCES);
  const markdown = toMarkdown("Test", "2026-10-21", card, SAMPLE_SOURCES);
  assert.match(markdown, /## Recap from selected evidence/);
  assert.match(markdown, /## Your recorded next idea/);
  assert.match(markdown, /Source: work-notes.md, lines 12/);
});
