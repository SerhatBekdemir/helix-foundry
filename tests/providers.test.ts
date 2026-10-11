import { it, expect, vi, afterEach } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import { Provider } from "../apps/api/src/providers.js";
import { ProviderSchema } from "../packages/shared/src/index.js";
afterEach(() => vi.unstubAllGlobals());
it("uses authenticated llama.cpp structured output and refuses truncated answers", async () => {
  const requests: any[] = [];
  let truncated = false;
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push({
      url: req.url,
      authorization: req.headers.authorization,
      body: JSON.parse(body),
    });
    res.end(
      JSON.stringify({
        choices: [
          {
            finish_reason: truncated ? "length" : "stop",
            message: { content: '{"ready":true}' },
          },
        ],
        usage: { total_tokens: 5 },
      }),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  try {
    const p = new Provider(
      ProviderSchema.parse({
        provider: "local",
        localRuntime: "llamacpp",
        model: "qwen3:4b",
        apiKey: "test-only",
        baseUrl: `http://127.0.0.1:${(server.address() as any).port}/v1/`,
      }),
    );
    expect(await p.generate("system", {}, { type: "object" })).toEqual({
      value: { ready: true },
      tokens: 5,
    });
    expect(requests[0].url).toBe("/v1/chat/completions");
    expect(requests[0].authorization).toBe("Bearer test-only");
    expect(requests[0].body.response_format.type).toBe("json_schema");
    expect(requests[0].body.response_format.json_schema.schema).toEqual({
      type: "object",
    });
    expect(requests[0].body.chat_template_kwargs.enable_thinking).toBe(false);
    truncated = true;
    await expect(p.generate("system", {}, {})).rejects.toThrow(
      "ran out of room",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    server.close();
  }
});
for (const provider of ["local", "claude", "openai"] as const)
  it(`uses the native ${provider} protocol without fallbacks`, async () => {
    const requests: any[] = [];
    // The local provider talks to Ollama over node:http, not fetch.
    const ollama = createServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      requests.push({
        url: req.url,
        body: JSON.parse(body),
        headers: req.headers,
      });
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          message: { content: '{"ready":true}' },
          prompt_eval_count: 2,
          eval_count: 3,
          done_reason: "stop",
        }),
      );
    });
    ollama.listen(0, "127.0.0.1");
    await once(ollama, "listening");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        requests.push({
          url,
          body: JSON.parse(init.body),
          headers: init.headers,
        });
        return Response.json(
          provider === "local"
            ? {
                message: { content: '{"ready":true}' },
                prompt_eval_count: 2,
                eval_count: 3,
              }
            : provider === "claude"
              ? {
                  content: [
                    {
                      type: "tool_use",
                      name: "submit",
                      input: { ready: true },
                    },
                  ],
                  usage: { input_tokens: 2, output_tokens: 3 },
                }
              : {
                  output: [
                    {
                      content: [
                        { type: "output_text", text: '{"ready":true}' },
                      ],
                    },
                  ],
                  usage: { total_tokens: 5 },
                },
        );
      }),
    );
    const p = new Provider(
      ProviderSchema.parse({
        provider,
        model: "test",
        apiKey: "test-only",
        baseUrl: "http://127.0.0.1:" + (ollama.address() as any).port,
      }),
    );
    const r = await p.generate(
      "system",
      { safe: "profile" },
      {
        type: "object",
        properties: { ready: { type: "boolean" } },
        required: ["ready"],
        additionalProperties: false,
      },
    );
    expect(r).toEqual({ value: { ready: true }, tokens: 5 });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain(
      provider === "local"
        ? "/api/chat"
        : provider === "claude"
          ? "/v1/messages"
          : "/v1/responses",
    );
    if (provider === "openai") {
      expect(requests[0].body.store).toBe(false);
      expect(requests[0].body.text.format.strict).toBe(true);
    }
    if (provider === "local") expect(requests[0].body.keep_alive).toBe("30s");
    if (provider === "local")
      expect(requests[0].body.options).toEqual({
        temperature: 0,
        num_ctx: 8192,
        num_predict: expect.any(Number),
      });
    ollama.close();
  });
it("sizes the local context window to the prompt and refuses what cannot fit", async () => {
  const seen: number[] = [];
  const ollama = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const options = JSON.parse(body).options;
    seen.push(options.num_ctx);
    res.end(
      JSON.stringify({
        message: { content: '{"ready":true}' },
        prompt_eval_count: 1,
        eval_count: 1,
        done_reason: options.num_ctx === 16384 ? "length" : "stop",
      }),
    );
  });
  ollama.listen(0, "127.0.0.1");
  await once(ollama, "listening");
  const p = new Provider(
    ProviderSchema.parse({
      provider: "local",
      model: "test",
      baseUrl: "http://127.0.0.1:" + (ollama.address() as any).port,
    }),
  );
  try {
    await expect(
      p.generate("", { data: "x".repeat(20_000) }, {}),
    ).rejects.toThrow("ran out of room");
    expect(seen).toEqual([16384]);
    await expect(
      p.generate("", { data: "x".repeat(200_000) }, {}),
    ).rejects.toThrow("Too much data for the local model");
    expect(seen).toHaveLength(1);
  } finally {
    ollama.close();
  }
});
it("reports provider outage without contacting another provider", async () => {
  const fetchMock = vi.fn(async () => new Response("", { status: 503 }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    new Provider(
      ProviderSchema.parse({
        provider: "openai",
        model: "test",
        apiKey: "test",
      }),
    ).generate("", {}, {}),
  ).rejects.toThrow("HTTP 503");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
