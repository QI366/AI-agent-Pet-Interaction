import { ACTIONS, actionBlock } from "./shared/domain.js";

const $ = (id) => document.getElementById(id);
const labels = { neutral: "自然", happy: "开心", excited: "兴奋", sad: "难过", angry: "生气", sleepy: "困困", surprised: "惊讶", curious: "好奇" };
const poseLabels = { yC00_pC00: "正面", yL15_pC00: "左 15°", yL30_pC00: "左 30°", yL60_pC00: "左 60°", yL90_pC00: "左侧", yR15_pC00: "右 15°", yR30_pC00: "右 30°", yR60_pC00: "右 60°", yR90_pC00: "右侧", yC00_pA45: "俯视", yC00_pB45: "仰视" };
const modeLabels = { rule: "本地规则演示", llm: "AI 陪伴已连接", fallback: "本次使用本地回退", safety: "照护安全提醒" };
const catalog = { poses: [], expressions: {}, props: {}, layers: {}, emotions: {} };
let state = null;
let busy = false;
let pending = null;
let lastTrace = null;
let visual = { pose: "yC00_pC00", expression: "neutral" };
let bootMode = "rule";
let layerVisible = false;
let visualReady = false;
let propTimer;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function notice(text = "") { $("notice").textContent = text; $("notice").hidden = !text; }
function speech(text) {
  $("speech").textContent = text;
  $("speech").classList.remove("pop");
  requestAnimationFrame(() => $("speech").classList.add("pop"));
}
function setMode(mode) {
  $("connection").className = "connection ready";
  $("connection-label").textContent = modeLabels[mode] || modeLabels.rule;
  $("mode-note").textContent = mode === "rule" ? "本地规则演示 · 当前未接入大模型 · 不提供医疗诊断" : mode === "fallback" ? "模型暂时不可用，本次已使用规则回复 · 不提供医疗诊断" : "虚拟宠物陪伴 · 不提供医疗诊断";
}
function saveVisual() { try { localStorage.setItem("poodle-appearance-v2", JSON.stringify(visual)); } catch { /* Cosmetic persistence is optional. */ } }
function renderPet() {
  if (!catalog.poses.length) return;
  const pose = catalog.poses.find((item) => item.id === visual.pose) || catalog.poses[0];
  visual.pose = pose.id;
  const src = catalog.expressions[visual.expression]?.[pose.id] || pose.file;
  if ($("pet-image").getAttribute("src") !== src) $("pet-image").src = src;
  $("pet-image").alt = `巧克力色泰迪，${pose.label}，${labels[visual.expression] || "自然"}表情`;
  $("pose-select").value = pose.id;
  $("expression-select").value = visual.expression;
}
function renderStats() {
  $("stats").replaceChildren(...[["mood", "心情"], ["hunger", "饱腹"], ["energy", "活力"]].map(([key, label]) => {
    const row = element("div", "stat-line");
    const title = element("div", "stat-label");
    title.append(element("span", "", label), element("strong", "", state[key]));
    const bar = element("div", "bar");
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-label", label);
    bar.setAttribute("aria-valuemin", "0"); bar.setAttribute("aria-valuemax", "100"); bar.setAttribute("aria-valuenow", String(state[key]));
    const fill = element("i", key); fill.style.width = `${state[key]}%`; bar.append(fill);
    row.append(title, bar); return row;
  }));
  const mood = state.energy < 15 ? ["😴", "想休息一会儿"] : state.hunger < 25 ? ["🥺", "肚子咕咕叫"] : state.mood >= 75 ? ["😊", "被陪伴的好心情"] : ["🙂", "想和你待在一起"];
  $("mood-emoji").textContent = mood[0]; $("mood-label").textContent = mood[1];
  $("streak-label").textContent = `今日陪伴 ${state.interactions} 次`;
  $("level").textContent = `Lv. ${state.level}`;
}
function renderMessages() {
  const nodes = [];
  const welcome = element("div", "message welcome");
  welcome.append(element("span", "message-label", "泰迪 · 你的日常搭子"), element("p", "bubble", "汪，终于等到你啦！\n告诉我你的名字，或者说“陪我玩球”，我们就从这里开始。"));
  nodes.push(welcome);
  for (const item of state.messages) {
    const row = element("div", `message ${item.role === "user" ? "user" : "assistant"}`);
    row.append(element("span", "message-label", item.role === "user" ? "你" : "泰迪"), element("p", "bubble", item.content)); nodes.push(row);
  }
  $("messages").replaceChildren(...nodes);
  $("messages").scrollTop = $("messages").scrollHeight;
}
function renderMemory() {
  const memoryLabels = { ownerName: "你的名字", favoriteToy: "喜欢的玩具" };
  const entries = Object.entries(state.memory);
  $("memory-list").replaceChildren(...(entries.length ? entries.map(([key, value]) => {
    const chip = element("span", "memory-chip"); chip.append(element("small", "", memoryLabels[key] || key), element("span", "", value)); return chip;
  }) : [element("p", "muted", "告诉我你的名字或喜欢的玩具，我们慢慢熟悉。") ]));
}
function renderLog() {
  const entries = state.log.slice(-5).reverse();
  $("activity-log").replaceChildren(...(entries.length ? entries.map((entry) => {
    const row = element("li"); const time = element("time", "", new Date(entry.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" }));
    time.dateTime = new Date(entry.at).toISOString();
    row.append(element("span", "", `${entry.emoji} ${entry.label}${entry.source === "agent" ? " · 聊天互动" : ""}`), time); return row;
  }) : [element("li", "muted", "还没有足迹，先摸摸泰迪的头吧。") ]));
}
function renderTrace(trace) {
  lastTrace = trace;
  if (!trace) {
    $("trace-summary").textContent = "聊一句，看看泰迪如何回应";
    $("trace-content").replaceChildren(element("p", "muted", "这里展示决策阶段、工具结果和耗时，不展示模型内部思维。")); return;
  }
  $("trace-summary").textContent = `${modeLabels[trace.mode]} · ${trace.toolCalls} 次工具 · ${trace.durationMs} ms`;
  const stageLabels = { policy: "授权检查", context: "读取记忆", tool: "工具执行", fallback: "规则回退", reply: "完成回复" };
  const rows = trace.steps.map((step) => {
    const row = element("div", "trace-step");
    const detail = step.stage === "tool" ? `${step.name}(${JSON.stringify(step.arguments)})\n${step.result.ok ? "成功" : "拒绝"} · ${step.status === "discarded" ? "已丢弃，未提交" : "已提交"}${step.result.reason ? ` · ${step.result.reason}` : ""}` : step.detail;
    row.append(element("strong", "", stageLabels[step.stage] || step.stage), element(step.stage === "tool" ? "code" : "span", "", detail)); return row;
  });
  rows.push(element("p", "trace-meta", `追踪编号 ${trace.id} · 模型请求 ${trace.modelCalls} 次 · 已报告 tokens ${trace.totalTokens}${trace.fallbackReason ? ` · 回退原因 ${trace.fallbackReason}` : ""}`));
  $("trace-content").replaceChildren(...rows);
}
function renderState(next, { messages = true } = {}) {
  state = next; renderStats(); renderMemory(); renderLog(); if (messages) renderMessages(); setBusy(busy);
}
function setBusy(value) {
  busy = value;
  const locked = busy || !state || Boolean(pending);
  for (const button of document.querySelectorAll("#actions button, #suggestions button, #send-button, #reset-button, #forget-button, #clear-log")) button.disabled = locked;
  $("chat-input").disabled = locked;
  $("chat-status").textContent = busy ? "正在认真回应…" : pending ? "等待重试" : state ? "在你身边" : "准备中";
  $("chat-form").setAttribute("aria-busy", String(busy));
  $("retry-button").hidden = !pending || busy;
  if (state) for (const button of document.querySelectorAll("#actions button")) {
    const reason = actionBlock(state, button.dataset.action);
    button.title = reason || ACTIONS[button.dataset.action].label;
    // Keep blocked actions clickable so the pet can explain the reason.
  }
}
function showAction(action) {
  clearTimeout(propTimer);
  const prop = $("prop-image");
  const file = action === "feed" ? catalog.props.bowl?.full : action === "play" ? catalog.props.ball : null;
  prop.classList.toggle("visible", Boolean(file));
  if (file) prop.src = file; else prop.removeAttribute("src");
  if (action) {
    const spark = element("span", "spark", ACTIONS[action]?.emoji || "✦");
    spark.style.left = `${40 + Math.random() * 20}%`; spark.style.top = "35%"; $("sparkles").append(spark);
    setTimeout(() => spark.remove(), 950);
    propTimer = setTimeout(() => { prop.classList.remove("visible"); }, 5000);
  }
}
async function request(path, body) {
  const response = await fetch(path, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(40_000) });
  let data;
  try { data = await response.json(); } catch { throw new Error("服务返回异常，请确认使用 npm start 启动项目。"); }
  if (!response.ok) throw Object.assign(new Error(data.error?.message || "服务暂时不可用"), { status: response.status, code: data.error?.code, state: data.state });
  return data;
}
async function mutate(path, payload = {}, retry = false) {
  if ((busy || pending) && !retry) return;
  const task = retry ? pending : { path, body: { ...payload, requestId: crypto.randomUUID(), expectedVersion: state.version } };
  if (!task) return;
  pending = task; setBusy(true); notice();
  try {
    const result = await request(task.path, task.body);
    pending = null;
    renderState(result.state);
    speech(result.reply);
    visual.expression = catalog.emotions[result.emotion]?.expression || "neutral";
    renderPet(); showAction(result.action);
    if (result.trace) { renderTrace(result.trace); setMode(result.trace.mode); }
    if (task.path === "/api/chat") { $("chat-input").value = ""; $("input-count").textContent = "Enter 发送 · Shift + Enter 换行"; }
    if (["/api/reset", "/api/forget"].includes(task.path)) { renderTrace(null); setMode(bootMode); }
    if (task.path === "/api/reset") {
      visual = { pose: "yC00_pC00", expression: "neutral" }; saveVisual(); renderPet();
      layerVisible = false; $("layer-preview").classList.remove("visible"); $("layer-toggle").setAttribute("aria-pressed", "false"); $("layer-preview").setAttribute("aria-hidden", "true");
    }
  } catch (error) {
    if (error.state) renderState(error.state);
    if (error.status && error.status < 500) pending = null;
    notice(error.status ? error.message : "暂时没收到结果。可点“重新获取上次结果”，同一请求不会重复执行。");
    if (error.status === 401) notice("会话已失效，请刷新页面后继续。");
  } finally { setBusy(false); }
}
function confirmClear(title, description, action) {
  $("confirm-title").textContent = title; $("confirm-description").textContent = description;
  const dialog = $("confirm-dialog"); dialog.returnValue = "cancel";
  dialog.addEventListener("close", () => { if (dialog.returnValue === "confirm") action(); }, { once: true }); dialog.showModal();
}
function assetUrl(file) {
  if (typeof file !== "string" || !/^[\w/-]+\.(?:png|webp)$/.test(file) || file.split("/").includes("..")) return "";
  return file.startsWith("assets/") ? file : `assets/${file}`;
}
async function loadCatalog() {
  const response = await fetch("assets/manifest.json");
  if (!response.ok) throw new Error("素材索引加载失败");
  const manifest = await response.json(); const pet = manifest.characters.poodle;
  catalog.poses = pet.poses.filter((p) => p.file && p.status !== "todo" && assetUrl(p.file)).map((p) => ({ id: p.id, file: assetUrl(p.file), label: poseLabels[p.id] || p.id }));
  catalog.poses.sort((a, b) => Object.keys(poseLabels).indexOf(a.id) - Object.keys(poseLabels).indexOf(b.id));
  if (!catalog.poses.length) throw new Error("没有可展示的宠物素材");
  for (const expression of pet.expressions) {
    if (expression.status === "todo" || !expression.files) continue;
    catalog.expressions[expression.id] = {};
    expression.poses.forEach((pose, index) => { const file = assetUrl(expression.files[index]); if (file) catalog.expressions[expression.id][pose] = file; });
  }
  for (const prop of manifest.props) catalog.props[prop.id] = typeof prop.file === "string" ? assetUrl(prop.file) : Object.fromEntries(Object.entries(prop.file || {}).map(([key, file]) => [key, assetUrl(file)]));
  catalog.emotions = pet.emotionMap;
  catalog.layers = pet.layers.sets.find((set) => set.pose === "yC00_pC00")?.files || {};
  $("pose-select").replaceChildren(...catalog.poses.map((p) => { const option = element("option", "", p.label); option.value = p.id; return option; }));
  $("expression-select").replaceChildren(...Object.entries(labels).map(([id, label]) => { const option = element("option", "", label); option.value = id; return option; }));
  $("layer-preview").replaceChildren(...(pet.layers.order || Object.keys(catalog.layers)).filter((part) => catalog.layers[part]).map((part) => { const image = element("img"); image.src = assetUrl(catalog.layers[part]); image.alt = ""; return image; }));
  try { const saved = JSON.parse(localStorage.getItem("poodle-appearance-v2")); if (saved && labels[saved.expression] && catalog.poses.some((p) => p.id === saved.pose)) visual = saved; } catch { /* Invalid preferences are ignored. */ }
  renderPet(); visualReady = true;
}
$("pet-image").addEventListener("error", () => {
  const fallback = catalog.poses.find((p) => p.id === visual.pose)?.file || catalog.poses[0]?.file;
  if (fallback && $("pet-image").getAttribute("src") !== fallback) $("pet-image").src = fallback;
  else { $("pet-image").removeAttribute("src"); $("pet-image").alt = "泰迪的形象暂时加载失败，仍然可以聊天。"; }
});
$("pose-select").addEventListener("change", (e) => { visual.pose = e.target.value; renderPet(); saveVisual(); });
$("expression-select").addEventListener("change", (e) => { visual.expression = e.target.value; renderPet(); saveVisual(); });
$("layer-toggle").addEventListener("click", () => {
  layerVisible = !layerVisible; $("layer-preview").classList.toggle("visible", layerVisible); $("layer-preview").setAttribute("aria-hidden", String(!layerVisible)); $("layer-toggle").setAttribute("aria-pressed", String(layerVisible));
  speech(layerVisible ? "这是还在验收的分层素材预览。" : "回到我的小客厅啦。 ");
});
$("actions").addEventListener("click", (e) => { const button = e.target.closest("button[data-action]"); if (button) void mutate("/api/actions", { action: button.dataset.action }); });
$("chat-form").addEventListener("submit", (e) => { e.preventDefault(); const message = $("chat-input").value.trim(); if (message) void mutate("/api/chat", { message }); });
$("chat-input").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("chat-form").requestSubmit(); } });
$("chat-input").addEventListener("input", () => { $("input-count").textContent = `${$("chat-input").value.length} / 500 · Enter 发送`; });
$("suggestions").addEventListener("click", (e) => { const button = e.target.closest("button"); if (button) { $("chat-input").value = button.textContent; void mutate("/api/chat", { message: button.textContent }); } });
$("retry-button").addEventListener("click", () => void mutate(null, {}, true));
$("forget-button").addEventListener("click", () => confirmClear("忘记这些小事？", "将清除名字、玩具偏好和近期聊天，宠物状态与陪伴足迹会保留。", () => void mutate("/api/forget")));
$("reset-button").addEventListener("click", () => confirmClear("重新开始陪伴？", "将清除宠物状态、等级、偏好、聊天和全部互动记录。", () => void mutate("/api/reset")));
$("clear-log").addEventListener("click", () => void mutate("/api/log/clear"));
$("stage").addEventListener("pointermove", (e) => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || e.pointerType === "touch") return;
  const rect = $("stage").getBoundingClientRect(); const x = (e.clientX - rect.left) / rect.width - .5; const y = (e.clientY - rect.top) / rect.height - .5;
  $("pet-wrap").style.transform = `translate(${x * 8}px,${y * 5}px) rotate(${x}deg)`;
});
$("stage").addEventListener("pointerleave", () => { $("pet-wrap").style.transform = ""; });
$("day-label").prepend(document.createTextNode(new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Shanghai" }).format(new Date())));
async function refresh() {
  if (busy || pending || document.hidden || !state) return;
  try { const data = await request("/api/session"); if (!busy && !pending && data.state.version >= state.version) renderState(data.state, { messages: data.state.version !== state.version }); } catch { /* The next user operation reports connectivity errors. */ }
}
async function boot() {
  const results = await Promise.allSettled([loadCatalog(), request("/api/session")]);
  if (results[0].status === "rejected") notice("部分形象素材暂时不可用，聊天和照护仍然可以继续。");
  if (results[1].status === "fulfilled") {
    bootMode = results[1].value.mode; renderState(results[1].value.state); setMode(bootMode);
  } else {
    $("connection").className = "connection error"; $("connection-label").textContent = "陪伴服务未连接";
    notice("请在项目目录执行 npm start，再访问终端显示的地址。");
  }
}
void boot();
setInterval(() => void refresh(), 30_000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) void refresh(); });
