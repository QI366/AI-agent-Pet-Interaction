import { inspectMessage } from "../server/policy.js";

const cases = [
  ["play", "陪我玩球", ["play"]], ["play", "我们一起玩", ["play"]], ["play", "接球！", ["play"]],
  ["pet", "摸摸头", ["pet"]], ["pet", "抱抱", ["pet"]], ["pet", "拍拍你", ["pet"]],
  ["feed", "喂一口", ["feed"]], ["feed", "开饭啦", ["feed"]], ["feed", "给泰迪吃狗粮", ["feed"]],
  ["water", "给你喝水", ["water"]], ["rest", "休息一会", ["rest"]], ["rest", "晚安", ["rest"]],
  ["none", "我喜欢玩球", []], ["none", "我昨天喂过它", []], ["none", "怎么喂食？", []], ["none", "你喜欢玩球吗？", []],
  ["none", "不要喂食", []], ["none", "别摸摸头", []], ["none", "如果我让你喂食", []], ["none", "我叫什么？", []],
];
let correct = 0;
const confusion = new Map();
for (const [expected, message, actions] of cases) {
  const policy = inspectMessage(message);
  const predicted = policy.allowedActions[0] || "none";
  const row = confusion.get(expected) || { total: 0, correct: 0 };
  row.total += 1;
  if (predicted === expected) { row.correct += 1; correct += 1; }
  else console.error(`MISS expected=${expected} predicted=${predicted} text=${message}`);
  if (policy.allowedActions.join(",") !== actions.join(",")) {
    console.error(`AUTHORIZATION MISMATCH text=${message} expected=${actions} actual=${policy.allowedActions}`);
    correct -= predicted === expected ? 1 : 0;
    row.correct -= predicted === expected ? 1 : 0;
  }
  confusion.set(expected, row);
}
console.log(`Deterministic authorization benchmark: ${correct}/${cases.length} correct (${(100 * correct / cases.length).toFixed(1)}%)`);
for (const [label, result] of confusion) console.log(`${label.padEnd(6)} ${result.correct}/${result.total} correct`);
console.log("Cases cover direct commands, questions, negation, past tense and preference statements; this is a rule-regression check, not a human-rated LLM-quality score.");
if (correct !== cases.length) process.exitCode = 1;
