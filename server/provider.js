export class ProviderError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export function providerConfig(env = process.env) {
  const values = [env.LLM_BASE_URL, env.LLM_MODEL, env.LLM_API_KEY];
  if (!values.some(Boolean)) return null;
  if (!values.every(Boolean)) throw new Error("LLM_BASE_URL, LLM_MODEL and LLM_API_KEY must be configured together");
  const url = new URL(env.LLM_BASE_URL);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
    throw new Error("LLM_BASE_URL must use HTTPS (HTTP is allowed only for loopback testing)");
  }
  if (url.username || url.password || url.search || url.hash) throw new Error("LLM_BASE_URL must not contain credentials, query or fragment");
  const timeoutMs = Number(env.LLM_TIMEOUT_MS || 8000);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) throw new Error("LLM_TIMEOUT_MS must be between 100 and 30000");
  return { endpoint: `${url.href.replace(/\/$/, "")}/chat/completions`, model: env.LLM_MODEL, apiKey: env.LLM_API_KEY, timeoutMs };
}

export function createProvider(config, fetchImpl = fetch) {
  if (!config) return null;
  return async function complete(messages, tools, remainingMs) {
    const signal = AbortSignal.timeout(Math.max(1, Math.min(config.timeoutMs, remainingMs)));
    try {
      const response = await fetchImpl(config.endpoint, {
        method: "POST", redirect: "error", signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model: config.model, messages, tools, tool_choice: "auto", parallel_tool_calls: false, max_completion_tokens: 400 }),
      });
      if (!response.ok) throw new ProviderError(response.status === 429 ? "provider_rate_limit" : "provider_http_error");
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 64 * 1024) throw new ProviderError("provider_response_too_large");
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); }
      const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const message = data?.choices?.[0]?.message;
      if (!message || message.role !== "assistant") throw new ProviderError("provider_invalid_output");
      return { message, usage: data.usage };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (signal.aborted) throw new ProviderError("provider_timeout");
      if (error instanceof SyntaxError) throw new ProviderError("provider_invalid_output");
      throw new ProviderError("provider_unavailable");
    }
  };
}
