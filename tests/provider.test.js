import test from "node:test";
import assert from "node:assert/strict";
import { createProvider, providerConfig } from "../server/provider.js";

const config = { endpoint: "http://127.0.0.1:9999/v1/chat/completions", apiKey: "test-secret", model: "test", timeoutMs: 100 };
test("provider configuration is explicit and rejects insecure nonlocal URLs", () => {
  assert.equal(providerConfig({}), null);
  assert.throws(() => providerConfig({ LLM_API_KEY: "secret" }), /configured together/);
  assert.throws(() => providerConfig({ LLM_API_KEY: "secret", LLM_MODEL: "test", LLM_BASE_URL: "http://example.com/v1" }), /HTTPS/);
  assert.equal(providerConfig({ LLM_API_KEY: "secret", LLM_MODEL: "test", LLM_BASE_URL: "https://example.com/v1/" }).endpoint, "https://example.com/v1/chat/completions");
});
test("provider sends strict tool schemas, keeps credentials in headers", async () => {
  const provider = createProvider(config, async (url, options) => {
    assert.equal(url, config.endpoint);
    assert.equal(options.headers.Authorization, "Bearer test-secret");
    assert.equal(options.redirect, "error");
    assert.equal(JSON.parse(options.body).parallel_tool_calls, false);
    return Response.json({ choices: [{ message: { role: "assistant", content: "{}" } }] });
  });
  assert.equal((await provider([], [], 100)).message.role, "assistant");
});
test("provider errors expose stable codes without leaking upstream bodies", async () => {
  const provider = createProvider(config, async () => new Response("api-key=secret", { status: 429 }));
  await assert.rejects(provider([], [], 100), (error) => error.code === "provider_rate_limit" && !error.message.includes("secret"));
});
test("provider rejects malformed and oversized responses", async () => {
  await assert.rejects(createProvider(config, async () => new Response("not json"))([], [], 100), { code: "provider_invalid_output" });
  await assert.rejects(createProvider(config, async () => new Response("x".repeat(70_000)))([], [], 100), { code: "provider_response_too_large" });
});
test("network failures use a sanitized fallback code", async () => {
  const provider = createProvider(config, async () => { throw new Error("secret URL and key"); });
  await assert.rejects(provider([], [], 100), { code: "provider_unavailable" });
});
test("abort signal bounds the whole provider round", async () => {
  const provider = createProvider(config, async (_url, { signal }) => new Promise((_resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("test failed to abort")), 1000);
    signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); });
  }));
  await assert.rejects(provider([], [], 20), { code: "provider_timeout" });
});
