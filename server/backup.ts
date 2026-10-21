import { z } from "zod";
import { projectInput, snapshotInput } from "../shared/validation.js";

const id = z.string().min(1).max(100),
  timestamp = z.iso.datetime();
const evidence = z.object({
  sourceId: id,
  quote: z.string().min(1).max(500),
  line: z.number().int().positive(),
});
const card = z.object({
  recap: z.string().min(1).max(1000),
  recapOrigin: z.literal("evidence").optional(),
  goal: z.array(evidence).max(1),
  progress: z.array(evidence).max(3),
  blockers: z.array(evidence).max(2),
  attempts: z.array(evidence).max(2),
  nextStep: z
    .object({
      title: z.string().min(1).max(120),
      detail: z.string().min(1).max(500),
      sourceIds: z.array(id).min(1).max(3),
      origin: z.enum(["author", "model"]).optional(),
      evidence: z.array(evidence).max(3).optional(),
    })
    .nullable(),
  questions: z.array(z.string().max(200)).max(3),
  discardedQuotes: z.number().int().nonnegative(),
  evidencePolicy: z.string().max(1000).optional(),
});
const snapshot = z
  .object({
    id,
    projectId: id,
    createdAt: timestamp,
    mode: z.enum(["example", "local"]),
    model: z.string().max(200),
    durationMs: z.number().nonnegative().nullable(),
    card,
  })
  .and(snapshotInput);
export const BackupSchema = z
  .object({
    format: z.literal("resume-button"),
    version: z.literal(1),
    exportedAt: timestamp,
    projects: z
      .array(
        z.object({
          project: projectInput.extend({
            id,
            createdAt: timestamp,
            updatedAt: timestamp,
            sample: z.boolean(),
            snapshotCount: z.number().int().nonnegative(),
          }),
          snapshots: z.array(snapshot).max(2000),
        }),
      )
      .max(200),
  })
  .superRefine((backup, ctx) => {
    const ids = new Set<string>(),
      snapshots = new Set<string>();
    for (const entry of backup.projects) {
      if (ids.has(entry.project.id))
        ctx.addIssue({
          code: "custom",
          message: "Duplicate project ID in backup.",
        });
      ids.add(entry.project.id);
      for (const saved of entry.snapshots) {
        if (saved.projectId !== entry.project.id || snapshots.has(saved.id))
          ctx.addIssue({
            code: "custom",
            message: "Invalid snapshot ownership or duplicate ID.",
          });
        snapshots.add(saved.id);
        const byId = new Map(
          saved.sources.map((source) => [source.id, source]),
        );
        const quotes = [
          ...saved.card.goal,
          ...saved.card.progress,
          ...saved.card.blockers,
          ...saved.card.attempts,
          ...(saved.card.nextStep?.evidence ?? []),
        ];
        for (const e of quotes) {
          const source = byId.get(e.sourceId);
          const prefix =
            source?.content
              .split("\n")
              .slice(0, e.line - 1)
              .join("\n") ?? "";
          const offset = e.line > 1 ? prefix.length + 1 : 0;
          if (
            !source ||
            (!source.content.slice(offset).startsWith(e.quote) &&
              !source.content.split("\n")[e.line - 1]?.includes(e.quote))
          )
            ctx.addIssue({
              code: "custom",
              message: "A backup quote does not match its saved source line.",
            });
        }
        if (
          saved.card.nextStep?.sourceIds.some((sourceId) => !byId.has(sourceId))
        )
          ctx.addIssue({
            code: "custom",
            message: "Unknown next-step source in backup.",
          });
      }
    }
  });
export type Backup = z.infer<typeof BackupSchema>;
