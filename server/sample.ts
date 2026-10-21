import { anchorCard } from "./cards.js";
import type { Snapshot, Source } from "../shared/types.js";
export const SAMPLE_SOURCES: Source[] = [
  {
    id: "sample-notes",
    name: "work-notes.md",
    kind: "note",
    content:
      '# Weekend Atlas — session notes\n\nGoal: Make destination search feel fast without showing stale results.\n\nCompleted: The search input and destination cards are connected to the API.\nCompleted: Added loading and empty states.\n\nBlocked: Typing "Lisbon" quickly sometimes shows the results for "Lis".\n\nTried: A 300 ms debounce reduced requests but did not stop older responses replacing newer results.\n\nNext idea: Track the latest request ID and ignore responses from previous requests.\nOpen question: Should we also cancel old requests to reduce network work?\n',
  },
  {
    id: "sample-code",
    name: "src/search.ts",
    kind: "file",
    content:
      "// Current implementation: last response to arrive wins.\nexport async function searchDestinations(query: string) {\n  const response = await fetch(`/api/destinations?q=${encodeURIComponent(query)}`);\n  const destinations = await response.json();\n  renderDestinations(destinations);\n}\n\ndeclare function renderDestinations(destinations: unknown[]): void;\n",
  },
  {
    id: "sample-tests",
    name: "test-output.log",
    kind: "log",
    content:
      "PASS renders destination cards\nPASS displays an empty state for no results\nFAIL keeps results for the latest query\nExpected: Lisbon\nReceived: Listowel\nRequests resolved in reverse order: Lisbon, then Lis.\n",
  },
  {
    id: "sample-readme",
    name: "README.md",
    kind: "file",
    content:
      "# Weekend Atlas\nA small trip planner for slow weekends.\n\nCurrent milestone: Reliable destination search.\nThe search should show results for the most recent query, even when requests finish out of order.\n\nThis is a fictional example project included with Resume Button.\n",
  },
];
export function sampleSnapshot(projectId: string): Snapshot {
  return {
    id: "sample-card",
    projectId,
    createdAt: new Date().toISOString(),
    mode: "example",
    model: "Handwritten example",
    durationMs: null,
    sources: SAMPLE_SOURCES,
    card: anchorCard(
      {
        recap:
          "The search UI is in place. An out-of-order response is still getting the last word.",
        goal: [
          {
            sourceId: "sample-notes",
            quote:
              "Make destination search feel fast without showing stale results.",
          },
        ],
        progress: [
          {
            sourceId: "sample-notes",
            quote:
              "The search input and destination cards are connected to the API.",
          },
          {
            sourceId: "sample-notes",
            quote: "Added loading and empty states.",
          },
        ],
        blockers: [
          {
            sourceId: "sample-tests",
            quote:
              "FAIL keeps results for the latest query\nExpected: Lisbon\nReceived: Listowel",
          },
        ],
        attempts: [
          {
            sourceId: "sample-notes",
            quote:
              "A 300 ms debounce reduced requests but did not stop older responses replacing newer results.",
          },
        ],
        nextStep: {
          title: "Let the latest search have the last word.",
          detail:
            "Add a request ID guard in search.ts, then rerun the test with responses arriving in reverse order.",
          sourceIds: ["sample-code", "sample-tests"],
        },
        questions: [
          "Should old requests also be cancelled to reduce network work?",
        ],
      },
      SAMPLE_SOURCES,
    ),
  };
}
