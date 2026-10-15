import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../server/store.js";

let directory;
let store;
test.before(async () => { directory = await mkdtemp(join(tmpdir(), "pet-agent-store-")); store = new SessionStore(directory); await store.init(); });
test.after(async () => { await rm(directory, { recursive: true, force: true }); });
test("session data is atomic-persisted and validates file-backed identities", async () => {
  const { id } = await store.create(1000);
  assert.equal((await store.read(id)).state.mood, 78);
  assert.equal(await store.read("../../secret"), null);
  await assert.rejects(readFile(join(directory, "secret.json")));
  await store.transaction(id, (record) => { record.state.mood = 81; return true; });
  assert.equal((await store.read(id)).state.mood, 81);
  assert.equal((await import("node:fs/promises")).readdir ? (await (await import("node:fs/promises")).readdir(directory)).some((x) => x.endsWith(".tmp")) : false, false);
});
test("per-session concurrent writes serialize without lost updates", async () => {
  const { id } = await store.create(1000);
  const write = (amount) => store.transaction(id, async (record) => {
    const before = record.state.totalInteractions;
    await new Promise((resolve) => setTimeout(resolve, 5));
    record.state.totalInteractions = before + amount;
  });
  await Promise.all([write(1), write(10), write(100)]);
  assert.equal((await store.read(id)).state.totalInteractions, 111);
});
test("expired or malformed sessions cannot be modified", async () => {
  await assert.rejects(store.transaction("00000000-0000-0000-0000-000000000000", () => {}), { code: "session_expired" });
  const { id } = await store.create(1000);
  await store.write(id, { schemaVersion: 99, state: {}, receipts: [] });
  await assert.rejects(store.read(id), /Invalid session record/);
});
