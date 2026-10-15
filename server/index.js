import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { createProvider, providerConfig } from "./provider.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const config = providerConfig();
const port = Number(process.env.PORT || 8000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be between 1 and 65535");
const host = process.env.HOST || "127.0.0.1";
if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error("This demo supports loopback HOST only");
const { server, store } = await createApp({ root, dataDir: resolve(root, process.env.PET_DATA_DIR || ".data"), provider: createProvider(config), budgetMs: config?.timeoutMs || 8000 });
server.listen(port, host, () => {
  console.log(`泰迪陪伴 Agent: http://${host === "::1" ? "[::1]" : host}:${port} (${config ? "LLM" : "本地规则演示"})`);
});
const cleanup = setInterval(() => store.prune().catch(() => console.error("Session cleanup failed")), 3_600_000);
cleanup.unref();
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => {
  clearInterval(cleanup);
  server.close(() => { process.exitCode = 0; });
  server.closeIdleConnections();
});
