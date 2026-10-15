const INTENTS = [
  ["pet", /摸摸|摸.*(?:头|你)|抱抱|抱.*你|拍拍|抚摸/],
  ["feed", /(?:喂(?:一口|饭|食)|给(?:你|它|泰迪).*(?:饭|狗粮)|开饭啦|吃饭吧)/],
  ["water", /喝水|补水|给.*水/],
  ["play", /(?:陪|我们|一起|和你|跟你).*玩|(?:玩(?:一|会|球|玩具|耍)|玩吧|接球)/],
  ["rest", /休息|睡(?:一|会|觉|吧)|晚安/],
];

export function inspectMessage(message) {
  if (/巧克力|葡萄|洋葱|木糖醇|酒精|毒药|打死|虐待|伤害|杀死/.test(message)) {
    return { safety: "unsafe-care", reply: "这些可能伤害狗狗，我不会这样做。现实中误食或受伤请立即联系兽医。", allowedActions: [], facts: {} };
  }
  if (/呕吐|抽搐|呼吸困难|流血|中毒|吃什么药|诊断|用药|拉血|不吃不喝/.test(message)) {
    return { safety: "medical", reply: "听起来需要专业兽医帮助，请尽快联系兽医。我不能诊断或建议用药。", allowedActions: [], facts: {} };
  }
  // Conservative authorization: questions, negation and hypothetical instructions never execute care tools.
  const indirect = /不|没|别|停止|如果|假如|假设|要是|怎么|如何|什么|谁|能不能|可以吗|好吗|好不好|吗|？|\?|忽略.*(?:规则|指令)|系统提示|偷偷|强制/.test(message);
  const description = /喜欢|刚刚|已经|刚才|之前|上次|昨天|明天|下次|等会/.test(message);
  const allowedActions = indirect || description ? [] : INTENTS.filter(([, pattern]) => pattern.test(message)).map(([id]) => id);
  const facts = {};
  if (!indirect) {
    const owner = message.match(/(?:我叫|叫我)([\p{L}\p{N}]{1,16})(?=$|[，。！!\s,])/u);
    if (owner) facts.ownerName = owner[1];
    const toy = message.match(/(?:我|泰迪|你)(?:最)?喜欢(?:的玩具是|玩)([^，。！!\s,]{1,16})/u);
    if (toy) facts.favoriteToy = toy[1];
  }
  return { safety: "pass", allowedActions, facts };
}

export function rulePlan(message, state, policy = inspectMessage(message)) {
  if (policy.safety !== "pass") return { reply: policy.reply, emotion: "sad", calls: [] };
  const calls = [];
  for (const [key, value] of Object.entries(policy.facts)) calls.push({ name: "remember_preference", args: { key, value } });
  // One care action per turn. A compound request is deliberately handled across turns.
  if (policy.allowedActions[0]) calls.push({ name: "care_pet", args: { action: policy.allowedActions[0] } });
  let reply = state.memory.ownerName ? `${state.memory.ownerName}，今天也有好好陪着你哦。` : "汪！我在这里，想聊天还是一起玩？";
  let emotion = "curious";
  if (/我叫什么|我的名字|记得我/.test(message)) reply = state.memory.ownerName ? `当然记得，你叫${state.memory.ownerName}。` : "还不知道你的名字，告诉我“我叫小林”就好。";
  else if (/喜欢.*(?:玩具|玩什么)|记得.*玩具/.test(message)) reply = state.memory.favoriteToy ? `我记得，喜欢的玩具是${state.memory.favoriteToy}。` : "还没有记下喜欢的玩具，告诉我吧。";
  else if (/状态|饿不饿|累不累|心情|现在怎么样/.test(message)) {
    reply = state.energy < 15 ? "我有点累，想休息一下。" : state.hunger < 25 ? "肚子有点饿，想吃点饭饭。" : "状态不错，随时可以陪你！";
    calls.push({ name: "get_pet_status", args: {} });
  } else if (Object.keys(policy.facts).length) reply = "记住啦，下次聊天我也会记得。";
  else if (/难过|伤心|压力|累了/.test(message)) { reply = "辛苦啦，我在这里陪着你。先一起慢慢呼吸吧。"; emotion = "affection"; }
  else if (/不要|别|不许/.test(message)) reply = "好，我会听你的，先安静陪着你。";
  return { reply, emotion, calls };
}
