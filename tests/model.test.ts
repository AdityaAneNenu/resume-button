import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { generateCard, modelStatus } from "../server/model.js";
import { SAMPLE_SOURCES } from "../server/sample.js";
import { sourceLines } from "../server/inference.js";

function modelOutput() {
  const lines = sourceLines(SAMPLE_SOURCES);
  const ids = (label: string) =>
    lines
      .filter((line) => line.label === label)
      .map((line) => line.id)
      .slice(0, label === "goal" ? 1 : label === "progress" ? 3 : 2);
  return {
    goal: ids("goal"),
    progress: ids("progress"),
    blockers: ids("blockers"),
    attempts: ids("attempts"),
    nextStep: {
      title: "Guard the latest request.",
      detail: "Ignore results from previous requests.",
      evidence: ids("next"),
    },
    questions: [],
  };
}

test("OpenAI-compatible protocol retries an invalid response once, then anchors real quotes", async () => {
  let requests = 0;
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/v1/models")
      return res.end(JSON.stringify({ data: [{ id: "test-model" }] }));
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(body.response_format.type, "json_schema");
    assert.equal(body.stream, false);
    requests++;
    if (requests === 2)
      assert.match(body.messages.at(-1).content, /validation error/);
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                requests === 1 ? '{"goal":[]}' : JSON.stringify(modelOutput()),
            },
          },
        ],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const previous = {
    url: process.env.MODEL_URL,
    name: process.env.MODEL_NAME,
    provider: process.env.MODEL_PROVIDER,
  };
  process.env.MODEL_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.MODEL_NAME = "test-model";
  process.env.MODEL_PROVIDER = "llama.cpp";
  try {
    assert.equal((await modelStatus()).ready, true);
    const result = await generateCard(SAMPLE_SOURCES, "Test project");
    assert.equal(requests, 2);
    assert.equal(result.card.progress.length, 2);
    assert.equal(result.card.discardedQuotes, 0);
    assert.equal(result.card.progress[0].line, 5);
    assert.equal(result.card.nextStep?.origin, "author");
    assert.equal(result.model, "test-model");
  } finally {
    for (const [name, value] of Object.entries({
      MODEL_URL: previous.url,
      MODEL_NAME: previous.name,
      MODEL_PROVIDER: previous.provider,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function withModel(
  provider: "llama.cpp" | "ollama",
  handler: (
    req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse,
  ) => void,
  run: () => Promise<void>,
) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const previous = {
    MODEL_URL: process.env.MODEL_URL,
    MODEL_NAME: process.env.MODEL_NAME,
    MODEL_PROVIDER: process.env.MODEL_PROVIDER,
  };
  process.env.MODEL_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.MODEL_NAME = "test-model";
  process.env.MODEL_PROVIDER = provider;
  try {
    await run();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("Ollama receives the same schema and returns a source-linked card", async () => {
  let body: any;
  await withModel(
    "ollama",
    async (req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/api/tags")
        return res.end(JSON.stringify({ models: [{ name: "test-model" }] }));
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString());
      res.end(
        JSON.stringify({ message: { content: JSON.stringify(modelOutput()) } }),
      );
    },
    async () => {
      assert.equal((await modelStatus()).ready, true);
      const result = await generateCard(SAMPLE_SOURCES, "Test project");
      assert.equal(body.format.type, "object");
      assert.equal(body.options.num_ctx, 8192);
      assert.equal(body.stream, false);
      assert.equal(result.card.blockers[0].line, 8);
    },
  );
});

test("malformed model responses exhaust the bounded retry with an actionable error", async () => {
  let requests = 0;
  await withModel(
    "llama.cpp",
    (_req, res) => {
      requests++;
      res.setHeader("Content-Type", "application/json");
      res.end("not json");
    },
    async () => {
      await assert.rejects(
        generateCard(SAMPLE_SOURCES, "Test"),
        /could not produce a source-linked card/,
      );
      assert.equal(requests, 2);
    },
  );
});

test("HTTP model errors are reported without retrying blindly", async () => {
  let requests = 0;
  await withModel(
    "llama.cpp",
    (_req, res) => {
      requests++;
      res.writeHead(503);
      res.end();
    },
    async () => {
      await assert.rejects(generateCard(SAMPLE_SOURCES, "Test"), /HTTP 503/);
      assert.equal(requests, 1);
    },
  );
});
