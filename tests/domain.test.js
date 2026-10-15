import test from "node:test";
import assert from "node:assert/strict";
import { createState, advanceState, applyAction, publicState } from "../shared/domain.js";

const now = Date.parse("2026-10-15T04:00:00Z");
test("offline decay uses elapsed five-minute intervals and retains remainder", () => {
  const state = createState(now);
  advanceState(state, now + 11 * 60_000);
  assert.deepEqual([state.mood, state.hunger, state.energy], [76, 60, 80]);
  advanceState(state, now + 14 * 60_000);
  assert.equal(state.hunger, 60);
  advanceState(state, now + 15 * 60_000);
  assert.equal(state.hunger, 58);
});
test("offline decay is bounded and values never become negative", () => {
  const state = createState(now);
  advanceState(state, now + 30 * 86_400_000);
  assert.deepEqual([state.mood, state.hunger, state.energy], [0, 0, 0]);
  const snapshot = structuredClone(state);
  advanceState(state, now + 30 * 86_400_000);
  assert.deepEqual(state, snapshot);
});
test("daily count resets at Shanghai midnight; lifetime level persists", () => {
  const state = createState(Date.parse("2026-10-15T15:59:59Z"));
  applyAction(state, "pet", now);
  advanceState(state, Date.parse("2026-10-15T16:00:01Z"));
  assert.equal(state.interactions, 0);
  assert.equal(state.totalInteractions, 1);
  assert.equal(state.day, "2026-10-16");
});
test("care guards prevent overfeeding and exhausted play without side effects", () => {
  const state = { ...createState(now), hunger: 95, energy: 5 };
  const snapshot = structuredClone(state);
  assert.equal(applyAction(state, "feed", now).ok, false);
  assert.equal(applyAction(state, "play", now).ok, false);
  assert.equal(applyAction(state, "__proto__", now).ok, false);
  assert.deepEqual(state, snapshot);
});
test("rest restores energy and logs stay bounded", () => {
  const state = { ...createState(now), energy: 10 };
  applyAction(state, "rest", now);
  assert.equal(state.energy, 30);
  for (let i = 0; i < 50; i += 1) applyAction(state, "pet", now);
  assert.equal(state.log.length, 30);
  assert.equal(publicState({ state }, now).level, 6);
  assert.equal(state.mood, 100);
});
test("rendered state does not mutate stored state", () => {
  const state = createState(now);
  assert.equal(publicState({ state }, now + 300_000).hunger, 62);
  assert.equal(state.hunger, 64);
});
