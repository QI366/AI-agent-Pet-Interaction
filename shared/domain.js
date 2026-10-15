export const ACTIONS = Object.freeze({
  pet: { label: "摸摸头", emoji: "🤎", mood: 8, hunger: 0, energy: 2, emotion: "happy", reply: "嘿嘿，再摸一会儿嘛。" },
  feed: { label: "喂食", emoji: "🍖", mood: 5, hunger: 18, energy: 4, emotion: "happy", reply: "好香！谢谢你准备的饭饭。" },
  water: { label: "喝水", emoji: "💧", mood: 3, hunger: 0, energy: 12, emotion: "happy", reply: "咕咚咕咚，喝完水舒服多啦！" },
  play: { label: "玩玩具", emoji: "🎾", mood: 12, hunger: -5, energy: -10, emotion: "excited", reply: "接住！和你玩球最开心啦。" },
  rest: { label: "休息", emoji: "🌙", mood: 2, hunger: -2, energy: 20, emotion: "sleepy", reply: "让我靠着你休息一会儿吧。" },
});

export const EMOTIONS = ["idle", "happy", "excited", "sad", "angry", "sleepy", "surprised", "curious", "affection"];
export const clamp = (value) => Math.max(0, Math.min(100, Math.round(value)));
export const dayKey = (now) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date(now));

export function createState(now = Date.now()) {
  return { mood: 78, hunger: 64, energy: 82, interactions: 0, totalInteractions: 0,
    day: dayKey(now), updatedAt: now, version: 0, memory: {}, log: [], messages: [] };
}

export function advanceState(state, now = Date.now()) {
  if (state.day !== dayKey(now)) { state.day = dayKey(now); state.interactions = 0; }
  // Offline decay is capped at eight hours. Fractional intervals are retained.
  const steps = Math.floor(Math.max(0, now - state.updatedAt) / 300_000);
  if (steps > 0) {
    const capped = Math.min(steps, 96);
    state.mood = clamp(state.mood - capped);
    state.hunger = clamp(state.hunger - capped * 2);
    state.energy = clamp(state.energy - capped);
    state.updatedAt += steps * 300_000;
  }
  return state;
}

export function actionBlock(state, action) {
  if (!Object.hasOwn(ACTIONS, action)) return "未知的互动动作";
  if (action === "feed" && state.hunger >= 90) return "肚子已经饱饱的啦，等饿了再吃吧。";
  if (action === "water" && state.energy >= 95) return "刚刚补充过水分啦，陪我坐一会儿吧。";
  if (action === "play" && state.energy < 15) return "有点累啦，让我先休息一会儿再玩。";
  if (action === "play" && state.hunger < 10) return "肚子咕咕叫，先吃点饭再玩吧。";
  if (action === "rest" && state.energy >= 95) return "现在精神满满，想和你聊聊天！";
  return null;
}

export function applyAction(state, id, now = Date.now(), source = "button") {
  const reason = actionBlock(state, id);
  if (reason) return { ok: false, action: id, reason };
  const action = ACTIONS[id];
  for (const key of ["mood", "hunger", "energy"]) state[key] = clamp(state[key] + action[key]);
  state.interactions += 1;
  state.totalInteractions += 1;
  state.log.push({ action: id, label: action.label, emoji: action.emoji, at: now, source });
  state.log = state.log.slice(-30);
  return { ok: true, action: id, reply: action.reply, emotion: action.emotion };
}

export function publicState(record, now = Date.now()) {
  const state = advanceState(structuredClone(record.state), now);
  return { ...state, level: 1 + Math.floor(state.totalInteractions / 10) };
}
