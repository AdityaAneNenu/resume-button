import { z } from "zod";
import {
  EXAMPLE_MESSAGES,
  INFERENCE_PROMPT,
  InferenceSchema,
  resolveInference,
  sourceLines,
} from "./inference.js";
import type { ModelStatus, Source } from "../shared/types.js";

export function localEndpoint(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(
      "MODEL_URL must be an HTTP loopback origin, such as http://127.0.0.1:8081.",
    );
  }
  return url.origin;
}
export function configuration() {
  const provider =
    process.env.MODEL_PROVIDER === "ollama" ? "ollama" : "llama.cpp";
  return {
    provider,
    url: localEndpoint(
      process.env.MODEL_URL ??
        (provider === "ollama"
          ? "http://127.0.0.1:11434"
          : "http://127.0.0.1:8081"),
    ),
    model:
      process.env.MODEL_NAME ??
      (provider === "ollama" ? "qwen2.5:1.5b" : "qwen2.5-1.5b-instruct"),
  } as const;
}
export async function modelStatus(): Promise<ModelStatus> {
  const config = configuration();
  try {
    const response = await fetch(
      config.url + (config.provider === "ollama" ? "/api/tags" : "/v1/models"),
      { signal: AbortSignal.timeout(2500), redirect: "error" },
    );
    if (!response.ok) throw new Error("not ready");
    const result = await response.json();
    const names: string[] =
      config.provider === "ollama"
        ? (result.models?.map((m: { name: string }) => m.name) ?? [])
        : (result.data?.map((m: { id: string }) => m.id) ?? []);
    const ready = names.includes(config.model);
    return {
      provider: config.provider,
      model: config.model,
      ready,
      message: ready
        ? "Ready on this device"
        : `Model ${config.model} is not loaded.`,
    };
  } catch {
    return {
      provider: config.provider,
      model: config.model,
      ready: false,
      message: "Start your local model to create a new card.",
    };
  }
}

export async function generateCard(
  sources: Source[],
  name: string,
  signal?: AbortSignal,
) {
  const config = configuration();
  const started = performance.now();
  const lines = sourceLines(sources);
  if (!lines.length)
    throw new Error(
      "Add a note or source with at least one meaningful line of text.",
    );
  const messages = [
    { role: "system", content: INFERENCE_PROMPT },
    ...EXAMPLE_MESSAGES,
    {
      role: "user",
      content:
        `Project: ${name}\n` +
        lines
          .map(
            (l) =>
              `${l.id} | ${l.name}${l.label ? ` [${l.label}]` : ""} | ${l.quote}`,
          )
          .join("\n"),
    },
  ];
  const schema = z.toJSONSchema(InferenceSchema);
  const requestSignal = AbortSignal.any([
    AbortSignal.timeout(180_000),
    ...(signal ? [signal] : []),
  ]);
  for (let attempt = 0; attempt < 2; attempt++) {
    requestSignal.throwIfAborted();
    let response: Response;
    try {
      response = await fetch(
        config.url +
          (config.provider === "ollama" ? "/api/chat" : "/v1/chat/completions"),
        {
          method: "POST",
          redirect: "error",
          headers: { "Content-Type": "application/json" },
          signal: requestSignal,
          body: JSON.stringify(
            config.provider === "ollama"
              ? {
                  model: config.model,
                  messages,
                  stream: false,
                  think: false,
                  format: schema,
                  options: { temperature: 0, num_ctx: 8192, num_predict: 1000 },
                }
              : {
                  model: config.model,
                  messages,
                  stream: false,
                  temperature: 0,
                  max_tokens: 1000,
                  response_format: {
                    type: "json_schema",
                    json_schema: { name: "resume_card", strict: true, schema },
                  },
                },
          ),
        },
      );
    } catch (error) {
      signal?.throwIfAborted();
      if (
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      )
        throw new Error(
          "The local model took too long. Try fewer or shorter sources. Your previous cards are saved.",
        );
      throw new Error(
        "Could not reach the local model. Start it with npm run model, then try again.",
      );
    }
    if (!response.ok)
      throw new Error(
        `The local model returned HTTP ${response.status}. Check that the configured model is loaded and try fewer sources.`,
      );
    let content: unknown;
    try {
      const payload = await response.json();
      content =
        config.provider === "ollama"
          ? payload.message?.content
          : payload.choices?.[0]?.message?.content;
      if (typeof content !== "string")
        throw new Error(
          "Missing response content. Return the requested JSON object.",
        );
      const card = resolveInference(JSON.parse(content), sources);
      return {
        card,
        model: config.model,
        durationMs: Math.round(performance.now() - started),
      };
    } catch (error) {
      signal?.throwIfAborted();
      if (requestSignal.aborted)
        throw new Error(
          "The local model took too long. Try fewer or shorter sources. Your previous cards are saved.",
        );
      if (attempt === 1)
        throw new Error(
          "The model could not produce a source-linked card. Try adding a clear note about your goal, progress, and blocker.",
        );
      messages.push({
        role: "assistant",
        content: typeof content === "string" ? content.slice(0, 7000) : "{}",
      });
      messages.push({
        role: "user",
        content: `Fix this validation error: ${error instanceof Error ? error.message.slice(0, 600) : "Invalid JSON"}. Use the supplied line IDs and schema. Return a complete corrected card.`,
      });
    }
  }
  throw new Error("Generation failed.");
}
