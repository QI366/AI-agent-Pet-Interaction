import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { advanceState, applyAction, createState, publicState } from "../shared/domain.js";
import { runAgent } from "./agent.js";
import { SessionStore } from "./store.js";

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".webp": "image/webp", ".ogg": "audio/ogg", ".jpg": "image/jpeg" };
const failure = (status, code, message) => Object.assign(new Error(message), { status, code });

async function jsonBody(req) {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json") throw failure(415, "json_required", "请使用 JSON 请求");
  let size = 0;
  const parts = [];
  for await (const part of req) {
    size += part.length;
    if (size > 8192) throw failure(413, "body_too_large", "请求内容过长");
    parts.push(part);
  }
  try {
    const body = JSON.parse(Buffer.concat(parts).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw failure(400, "invalid_json", "请求内容不是有效 JSON"); }
}

export async function createApp({ root = process.cwd(), dataDir = resolve(root, ".data"), provider = null, budgetMs = 8000, logger = console.log, clock = Date.now } = {}) {
  const store = new SessionStore(dataDir);
  await store.init();
  const systemPrompt = await readFile(resolve(root, "prompts/poodle_system.md"), "utf8");
  const assetRoot = await realpath(resolve(root, "assets"));
  const clientRoot = await realpath(resolve(root, "shared"));
  const rate = new Map();
  let lastPrune = 0;
  const server = createServer(async (req, res) => {
    const requestId = randomUUID();
    const started = performance.now();
    const send = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify(body));
    };
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.setHeader("X-Request-Id", requestId);
    try {
      const boundPort = server.address()?.port;
      const hosts = new Set([`127.0.0.1:${boundPort}`, `localhost:${boundPort}`, `[::1]:${boundPort}`]);
      if (!hosts.has(req.headers.host)) throw failure(403, "host_not_allowed", "仅支持本机访问");
      const origin = `http://${req.headers.host}`;
      const url = new URL(req.url, origin);
      if (url.pathname.startsWith("/api/")) {
        if (req.headers.origin && req.headers.origin !== origin) throw failure(403, "origin_not_allowed", "请求来源不受支持");
        if (!["GET", "POST"].includes(req.method)) throw failure(405, "method_not_allowed", "请求方法不受支持");
        const now = clock();
        const address = req.socket.remoteAddress;
        if (now - lastPrune > 60_000) {
          for (const [key, value] of rate) if (now - value.since > 60_000) rate.delete(key);
          lastPrune = now;
        }
        const bucket = rate.get(address) || { since: now, count: 0 };
        if (now - bucket.since > 60_000) { bucket.since = now; bucket.count = 0; }
        bucket.count += 1;
        rate.set(address, bucket);
        if (bucket.count > 120) { res.setHeader("Retry-After", "60"); throw failure(429, "rate_limited", "操作有点快，请稍后再试"); }
        if (url.pathname === "/api/health" && req.method === "GET") {
          send(200, { status: "ok", mode: provider ? "llm" : "rule", version: "0.2.0" }); return;
        }
        const isRead = url.pathname === "/api/session" && req.method === "GET";
        const operation = { "/api/actions": "action", "/api/chat": "chat", "/api/reset": "reset", "/api/forget": "forget", "/api/log/clear": "clear-log" }[url.pathname];
        if (!isRead && (!operation || req.method !== "POST")) throw failure(404, "not_found", "接口不存在");
        let id = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("pet_session="))?.slice(12);
        let record = await store.read(id);
        if (!record) {
          if (!isRead) throw failure(401, "session_expired", "会话已失效，请刷新页面");
          ({ id, record } = await store.create(now));
          res.setHeader("Set-Cookie", `pet_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`);
        }
        if (isRead) {
          const state = await store.transaction(id, async (current) => { current.lastAccessAt = now; return publicState(current, now); });
          send(200, { state, mode: provider ? "llm" : "rule" }); return;
        }
        const body = await jsonBody(req);
        if (typeof body.requestId !== "string" || !/^[\w-]{8,80}$/.test(body.requestId)) throw failure(400, "invalid_request_id", "缺少有效的请求编号");
        if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0) throw failure(400, "invalid_version", "缺少有效的状态版本");
        if (operation === "chat" && (typeof body.message !== "string" || !body.message.trim() || body.message.length > 500)) throw failure(400, "invalid_message", "请输入 1 到 500 个字符");
        if (operation === "action" && (typeof body.action !== "string" || !["pet", "feed", "water", "play", "rest"].includes(body.action))) throw failure(400, "invalid_action", "未知互动动作");
        const fingerprint = createHash("sha256").update(JSON.stringify([operation, body.action ?? null, body.message ?? null])).digest("hex");
        const result = await store.transaction(id, async (current) => {
          const receipt = current.receipts.find((item) => item.id === body.requestId);
          if (receipt) {
            if (receipt.fingerprint !== fingerprint) throw failure(409, "request_id_reused", "请求编号已用于其他操作");
            return { ...receipt.response, replayed: true, state: publicState(current, now) };
          }
          if (current.state.version !== body.expectedVersion) throw Object.assign(failure(409, "version_conflict", "状态已被其他页面更新，请查看新状态后重试"), { state: publicState(current, now) });
          advanceState(current.state, now);
          let response;
          if (operation === "chat") {
            const answer = await runAgent({ message: body.message.trim(), state: current.state, provider, systemPrompt, now, budgetMs });
            current.state = answer.state;
            response = { reply: answer.reply, emotion: answer.emotion, action: answer.action, trace: answer.trace };
          } else if (operation === "action") {
            const answer = applyAction(current.state, body.action, now);
            response = { reply: answer.ok ? answer.reply : answer.reason, emotion: answer.ok ? answer.emotion : "sleepy", action: answer.ok ? body.action : null, blocked: !answer.ok };
          } else if (operation === "reset") {
            const previousVersion = current.state.version;
            current.state = { ...createState(now), version: previousVersion };
            current.receipts = [];
            response = { reply: "新的陪伴从现在开始。", emotion: "idle", action: null };
          } else if (operation === "forget") {
            current.state.memory = {};
            current.state.messages = [];
            current.receipts = []; // Old replies/traces may contain remembered facts.
            response = { reply: "已忘记偏好和聊天记录，我们重新认识吧。", emotion: "idle", action: null };
          } else {
            current.state.log = [];
            response = { reply: "互动记录已清空。", emotion: "idle", action: null };
          }
          current.lastAccessAt = now;
          current.state.version += 1;
          response.state = publicState(current, now);
          current.receipts.push({ id: body.requestId, fingerprint, response });
          current.receipts = current.receipts.slice(-32);
          // Store only turn output in receipts; current state is attached when replayed.
          for (const item of current.receipts) delete item.response.state;
          return { ...response, state: publicState(current, now) };
        });
        send(200, result);
        logger(JSON.stringify({ event: "pet_turn", requestId, operation, mode: result.trace?.mode, traceId: result.trace?.id,
          durationMs: Math.round(performance.now() - started), replayed: result.replayed || false }));
        return;
      }
      if (!["GET", "HEAD"].includes(req.method)) throw failure(405, "method_not_allowed", "请求方法不受支持");
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { throw failure(400, "invalid_path", "路径格式错误"); }
      const topFiles = new Set(["/", "/index.html", "/styles.css", "/app.js"]);
      const isAsset = pathname.startsWith("/assets/") && !pathname.startsWith("/assets/imported/db/source/") && Object.hasOwn(MIME, extname(pathname));
      const isShared = pathname === "/shared/domain.js";
      if (!topFiles.has(pathname) && !isAsset && !isShared) throw failure(404, "not_found", "文件不存在");
      let file;
      try { file = await realpath(resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`)); }
      catch (error) { if (["ENOENT", "ENOTDIR"].includes(error.code)) throw failure(404, "not_found", "文件不存在"); throw error; }
      const allowedRoot = isAsset ? assetRoot : isShared ? clientRoot : resolve(root);
      if (!file.startsWith(`${allowedRoot}${sep}`)) throw failure(404, "not_found", "文件不存在");
      const content = await readFile(file);
      res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch (error) {
      const status = error.status || 500;
      if (status === 500) logger(JSON.stringify({ event: "server_error", requestId, code: error.code || "internal_error" }));
      if (!res.headersSent) send(status, { error: { code: error.code && status !== 500 ? error.code : "internal_error", message: status === 500 ? "服务暂时不可用，请稍后再试" : error.message }, ...(error.state ? { state: error.state } : {}) });
      else res.end();
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return { server, store };
}
