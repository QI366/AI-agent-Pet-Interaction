import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../server/app.js";
let directory;
let app;
let base;
let sessionId;
test.before(async () => {
  directory = await mkdtemp(join(tmpdir(), "pet-agent-http-"));
  app = await createApp({ root: fileURLToPath(new URL("../", import.meta.url)), dataDir: join(directory, "sessions"), logger: () => {}, clock: () => Date.parse("2026-10-15T04:00:00Z") });
  await new Promise((resolve, reject) => { app.server.once("error", reject); app.server.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${app.server.address().port}`;
});
test.after(async () => {
  if (app) await new Promise((resolve) => app.server.close(resolve));
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function request(path, { method = "GET", body, headers = {}, useCookie = true } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { ...(useCookie && sessionId ? { Cookie: `pet_session=${sessionId}` } : {}), ...(body && !headers["Content-Type"] ? { "Content-Type": "application/json" } : {}), ...headers }, ...(body ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}) });
  const cookie = response.headers.get("set-cookie");
  if (cookie) sessionId = cookie.match(/pet_session=([^;]+)/)?.[1];
  const data = response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.text();
  return { response, data };
}
const payload = (extra = {}, version = 0) => ({ requestId: crypto.randomUUID(), expectedVersion: version, ...extra });
test("serves the app and only approved public assets", async () => {
  for (const route of ["/", "/app.js", "/shared/domain.js", "/assets/manifest.json", "/assets/characters/poodle/pose/poodle_pose_yC00_pC00.png"]) assert.equal((await request(route)).response.status, 200, route);
  for (const route of ["/prompts/poodle_system.md", "/server/app.js", "/assets/imported/db/source/prop_ball.png", "/package.json", "/..%5Cserver%5Capp.js"]) assert.equal((await request(route)).response.status, 404, route);
});
test("origin and verb checks defend local endpoints", async () => {
  const { response } = await request("/api/session", { headers: { Origin: "https://attacker.example" }, useCookie: false });
  assert.equal(response.status, 403);
  assert.equal((await request("/api/session", { method: "OPTIONS" })).response.status, 405);
});
test("session cookie has HttpOnly SameSite restrictions and malformed input fails cleanly", async () => {
  const { response, data } = await request("/api/session", { useCookie: false });
  const cookies = response.headers.getSetCookie();
  assert.match(cookies[0], /HttpOnly/); assert.match(cookies[0], /SameSite=Strict/);
  assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(data.mode, "rule");
  assert.equal((await request("/api/chat", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" })).response.status, 415);
  assert.equal((await fetch(`${base}/api/chat`, { method: "POST", headers: { Cookie: `pet_session=${sessionId}`, "Content-Type": "application/json" }, body: "{" })).status, 400);
});
test("chat remembers disclosed facts without action and reads memory back", async () => {
  let result = await request("/api/chat", { method: "POST", body: payload({ message: "我叫小林，我喜欢玩球" }) });
  assert.equal(result.data.state.memory.ownerName, "小林"); assert.equal(result.data.state.totalInteractions, 0);
  assert.equal(result.data.trace.mode, "rule");
  assert.ok(result.data.trace.steps.every((step) => step.stage !== "tool" || step.status === "committed"));
  result = await request("/api/chat", { method: "POST", body: payload({ message: "我叫什么" }, result.data.state.version) });
  assert.match(result.data.reply, /小林/); assert.equal(result.data.state.memory.ownerName, "小林");
});
test("duplicate submission is idempotent and stale versions conflict", async () => {
  const current = await request("/api/session");
  const body = payload({ action: "pet" }, current.data.state.version);
  const [first, replay] = await Promise.all([request("/api/actions", { method: "POST", body }), request("/api/actions", { method: "POST", body })]);
  assert.equal(first.response.status, 200); assert.equal(replay.response.status, 200); assert.equal(replay.data.replayed, true);
  assert.equal(first.data.state.totalInteractions, replay.data.state.totalInteractions);
  const latest = await request("/api/session");
  assert.equal((await request("/api/actions", { method: "POST", body: payload({ action: "pet" }, latest.data.state.version - 1) })).response.status, 409);
  assert.equal((await request("/api/actions", { method: "POST", body: { ...body, action: "feed" } })).response.status, 409);
});
test("input, request size, path and method boundaries are enforced", async () => {
  let version = (await request("/api/session")).data.state.version;
  assert.equal((await request("/api/chat", { method: "POST", body: payload({ message: "  " }, version) })).response.status, 400);
  assert.equal((await request("/api/chat", { method: "POST", body: payload({ message: "说".repeat(501) }, version) })).response.status, 400);
  assert.equal((await request("/api/chat", { method: "POST", body: { message: "hello" } })).response.status, 400);
  assert.equal((await request("/api/chat", { method: "POST", body: payload({ message: "x".repeat(9000) }, version) })).response.status, 413);
  assert.equal((await request("/api/nope")).response.status, 404);
  assert.equal((await request("/api/actions", { method: "PUT" })).response.status, 405);
  const actions = await request("/api/actions", { method: "POST", body: payload({ action: "water" }, version) }); version = actions.data.state.version;
  assert.equal((await request("/api/log/clear", { method: "POST", body: payload({}, version) })).response.status, 200);
});
test("clearing memories, logs and all data follows explicit independent scopes", async () => {
  let state = (await request("/api/session")).data.state;
  let result = await request("/api/chat", { method: "POST", body: payload({ message: "我叫小林" }, state.version) }); state = result.data.state;
  result = await request("/api/actions", { method: "POST", body: payload({ action: "pet" }, state.version) }); state = result.data.state;
  result = await request("/api/log/clear", { method: "POST", body: payload({}, state.version) }); state = result.data.state;
  assert.equal(state.log.length, 0); assert.equal(state.memory.ownerName, "小林");
  result = await request("/api/forget", { method: "POST", body: payload({}, state.version) }); state = result.data.state;
  assert.deepEqual(state.memory, {}); assert.equal(state.messages.length, 0); assert.equal(state.log.length, 0);
  assert.equal((await request("/api/reset", { method: "POST", body: payload({}, state.version - 1) })).response.status, 409);
  result = await request("/api/reset", { method: "POST", body: payload({}, state.version) });
  assert.equal(result.data.state.totalInteractions, 0); assert.equal(result.data.state.level, 1); assert.equal(result.data.state.mood, 78);
});
test("expired cookie is rejected rather than silently changing identity", async () => {
  const { response } = await request("/api/chat", { method: "POST", headers: { Cookie: "pet_session=00000000-0000-0000-0000-000000000000" }, body: payload({ message: "hi" }) });
  assert.equal(response.status, 401);
});
