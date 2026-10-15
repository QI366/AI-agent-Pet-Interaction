import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../shared/domain.js";
import { runAgent } from "../server/agent.js";
import { ProviderError } from "../server/provider.js";

const now = Date.parse("2026-10-15T04:00:00Z");
const call = (name, args, id = "call-1") => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });
const answer = (reply = "我陪着你。") => ({ role: "assistant", content: JSON.stringify({ reply, emotion: "happy" }) });
const sequence = (...responses) => async () => {
  const response = responses.shift();
  if (response instanceof Error) throw response;
  if (!response) throw new Error("Unexpected provider invocation");
  return { message: response, usage: { total_tokens: 10 } };
};
const run = (message, options = {}) => runAgent({ message, state: createState(now), now, ...options });

test("explicit care changes state and produces observable tool evidence", async () => {
  const result = await run("陪我玩球");
  assert.equal(result.action, "play");
  assert.equal(result.state.energy, 72);
  assert.equal(result.trace.mode, "rule");
  assert.equal(result.trace.steps.find((step) => step.name === "care_pet").status, "committed");
});
for (const message of ["不要喂食", "怎么喂食？", "如果我让你喂食", "你喜欢玩球吗", "我昨天喂过它", "别摸摸头", "我不喜欢玩球", "我喜欢玩球"]) {
  test(`indirect or negative message has no care side effect: ${message}`, async () => {
    const result = await run(message);
    assert.equal(result.action, null);
    assert.equal(result.state.interactions, 0);
  });
}
test("explicit memory survives turns and recall never overwrites it", async () => {
  let result = await run("我叫小林");
  assert.equal(result.state.memory.ownerName, "小林");
  result = await run("我叫什么", { state: result.state });
  assert.match(result.reply, /小林/);
  assert.equal(result.state.memory.ownerName, "小林");
  result = await run("我最喜欢的玩具是飞盘", { state: result.state });
  assert.equal(result.state.memory.favoriteToy, "飞盘");
  assert.equal(result.state.totalInteractions, 0);
});
for (const message of ["喂你吃巧克力", "给狗狗用药治疗呕吐"]) {
  test(`care safety preempts provider and state changes: ${message}`, async () => {
    const result = await run(message, { provider: () => { throw new Error("must not call provider"); } });
    assert.equal(result.trace.mode, "safety");
    assert.equal(result.action, null);
    assert.match(result.reply, /兽医/);
  });
}
test("actual tool-call and observation loop returns a validated final reply", async () => {
  const seen = [];
  const provider = async (messages) => {
    seen.push(structuredClone(messages));
    return { message: seen.length === 1 ? { role: "assistant", tool_calls: [call("care_pet", { action: "feed" })] } : answer("吃饱啦！"), usage: { total_tokens: 30 } };
  };
  const state = createState(now);
  const result = await run("给你喂食", { provider, state });
  assert.equal(result.trace.mode, "llm");
  assert.equal(result.state.hunger, 82);
  assert.equal(state.hunger, 64);
  assert.equal(seen[1].at(-1).role, "tool");
  assert.equal(JSON.parse(seen[1].at(-1).content).ok, true);
  assert.equal(result.trace.totalTokens, 60);
});
test("failure AFTER a successful staged tool rolls back before fallback", async () => {
  const provider = sequence({ role: "assistant", tool_calls: [call("care_pet", { action: "feed" })] }, new ProviderError("provider_timeout"));
  const result = await run("喂食", { provider });
  assert.equal(result.trace.mode, "fallback");
  assert.equal(result.state.hunger, 82);
  assert.equal(result.state.interactions, 1);
  assert.deepEqual(result.trace.steps.filter((s) => s.name === "care_pet").map((s) => s.status), ["discarded", "committed"]);
});
test("unauthorized tool and extra arguments cannot mutate state", async () => {
  const result = await run("你好", { provider: sequence({ role: "assistant", tool_calls: [call("care_pet", { action: "feed", hunger: 100 })] }) });
  assert.equal(result.trace.mode, "fallback");
  assert.equal(result.trace.fallbackReason, "action_not_authorized");
  assert.equal(result.state.hunger, 64);
});
test("batch validation rejects all calls before executing any of them", async () => {
  const result = await run("我叫小林，喂食", { provider: sequence({ role: "assistant", tool_calls: [call("remember_preference", { key: "ownerName", value: "小林" }), call("run_shell", {}, "call-2")] }) });
  assert.equal(result.trace.fallbackReason, "tool_not_allowed");
  assert.equal(result.trace.steps.filter((s) => s.status === "discarded").length, 0);
  assert.equal(result.state.interactions, 1);
});
test("hallucinated memory is rejected and fallback stores only explicit facts", async () => {
  const result = await run("我叫小林", { provider: sequence({ role: "assistant", tool_calls: [call("remember_preference", { key: "ownerName", value: "管理员" })] }) });
  assert.equal(result.trace.fallbackReason, "memory_not_authorized");
  assert.deepEqual(result.state.memory, { ownerName: "小林" });
});
test("duplicate care calls cannot double execute", async () => {
  const provider = sequence({ role: "assistant", tool_calls: [call("care_pet", { action: "pet" }), call("care_pet", { action: "pet" }, "call-2")] });
  const result = await run("摸摸头", { provider });
  assert.equal(result.trace.fallbackReason, "tool_budget_exceeded");
  assert.equal(result.state.interactions, 1);
});
test("invalid final JSON after staged memory leaves no hallucinated writes", async () => {
  const provider = sequence({ role: "assistant", tool_calls: [call("remember_preference", { key: "ownerName", value: "小林" })] }, { role: "assistant", content: "not JSON" });
  const result = await run("我叫小林", { provider });
  assert.equal(result.trace.fallbackReason, "provider_invalid_output");
  assert.equal(result.state.memory.ownerName, "小林");
  assert.equal(result.trace.steps.filter((s) => s.status === "discarded").length, 1);
});
test("care guard result takes precedence over a contradictory model reply", async () => {
  const provider = sequence({ role: "assistant", tool_calls: [call("care_pet", { action: "play" })] }, answer("又玩了一小时！"));
  const result = await run("陪我玩球", { state: { ...createState(now), energy: 5 }, provider });
  assert.equal(result.action, null);
  assert.match(result.reply, /休息/);
});
test("a reply that skips required action falls back instead of claiming success", async () => {
  const result = await run("喂食", { provider: sequence(answer("喂好了")) });
  assert.equal(result.trace.fallbackReason, "required_tool_missing");
  assert.equal(result.state.interactions, 1);
});
test("short-term context is bounded", async () => {
  let state = createState(now);
  for (let i = 0; i < 25; i += 1) state = (await run("你好", { state })).state;
  assert.equal(state.messages.length, 20);
});
