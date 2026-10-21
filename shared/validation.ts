import { z } from "zod";

export const sourceInput = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(240),
  content: z.string().min(1).max(6000),
  kind: z.enum(["file", "note", "log", "git"]),
});
export const projectInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).default(""),
  rootPath: z.string().trim().max(1000).default(""),
});
export const snapshotInput = z
  .object({ sources: z.array(sourceInput).min(1).max(20) })
  .superRefine(({ sources }, ctx) => {
    if (sources.reduce((n, s) => n + s.content.length, 0) > 18000)
      ctx.addIssue({
        code: "custom",
        message: "Choose fewer sources: the total limit is 18,000 characters.",
      });
    if (new Set(sources.map((s) => s.id)).size !== sources.length)
      ctx.addIssue({ code: "custom", message: "Source IDs must be unique." });
  });
