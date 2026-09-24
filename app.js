const DEFAULT_POSES = [
  { id: "yC00_pC00", label: "正面", file: "assets/characters/poodle/pose/poodle_pose_yC00_pC00.png" },
  { id: "yL15_pC00", label: "左 15°", file: "assets/characters/poodle/pose/poodle_pose_yL15_pC00.png" },
  { id: "yL30_pC00", label: "左 30°", file: "assets/characters/poodle/pose/poodle_pose_yL30_pC00.png" },
  { id: "yL60_pC00", label: "左 60°", file: "assets/characters/poodle/pose/poodle_pose_yL60_pC00.png" },
  { id: "yL90_pC00", label: "左侧", file: "assets/characters/poodle/pose/poodle_pose_yL90_pC00.png" },
  { id: "yR15_pC00", label: "右 15°", file: "assets/characters/poodle/pose/poodle_pose_yR15_pC00.png" },
  { id: "yR30_pC00", label: "右 30°", file: "assets/characters/poodle/pose/poodle_pose_yR30_pC00.png" },
  { id: "yR60_pC00", label: "右 60°", file: "assets/characters/poodle/pose/poodle_pose_yR60_pC00.png" },
  { id: "yR90_pC00", label: "右侧", file: "assets/characters/poodle/pose/poodle_pose_yR90_pC00.png" },
  { id: "yC00_pA45", label: "俯视", file: "assets/characters/poodle/pose/poodle_pose_yC00_pA45.png" },
  { id: "yC00_pB45", label: "仰视", file: "assets/characters/poodle/pose/poodle_pose_yC00_pB45.png" },
];

const EXPRESSION_LABELS = {
  neutral: "中性",
  happy: "开心",
  excited: "兴奋",
  sad: "难过",
  angry: "生气",
  sleepy: "困困",
  surprised: "惊讶",
  curious: "好奇",
};

const ACTIONS = {
  pet: { label: "摸摸头", emoji: "🤎", message: "嘿嘿，再摸一会儿嘛。", mood: 8, hunger: 0, energy: 2, fx: "🤎" },
  feed: { label: "喂食", emoji: "🍖", message: "好香！谢谢你给我准备饭饭。", mood: 5, hunger: 18, energy: 4, fx: "✨" },
  water: { label: "喝水", emoji: "💧", message: "咕咚咕咚，充满水分啦！", mood: 3, hunger: 0, energy: 12, fx: "💧" },
  play: { label: "玩玩具", emoji: "🎾", message: "接住！我们再来一次！", mood: 12, hunger: -5, energy: -10, fx: "⭐" },
};

const state = { mood: 78, hunger: 64, energy: 82, interactions: 0, poseId: "yC00_pC00", expressionId: "neutral", log: [] };
const catalog = { poses: DEFAULT_POSES, expressions: {}, fxHeart: [], props: {}, layers: {} };
const STORAGE_KEY = "poodle-pet-state-v1";
const $ = (id) => document.getElementById(id);
const petImage = $("pet-image");
const petWrap = $("pet-wrap");
const stage = $("stage");
const speech = $("speech");

function clamp(value) { return Math.max(0, Math.min(100, value)); }

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* 隐私模式下仍可正常游玩 */ }
}

function restoreState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved) return;
    const numberOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    state.mood = clamp(numberOr(saved.mood, state.mood));
    state.hunger = clamp(numberOr(saved.hunger, state.hunger));
    state.energy = clamp(numberOr(saved.energy, state.energy));
    state.interactions = Math.max(0, numberOr(saved.interactions, 0));
    state.poseId = typeof saved.poseId === "string" ? saved.poseId : state.poseId;
    state.expressionId = typeof saved.expressionId === "string" ? saved.expressionId : state.expressionId;
    state.log = Array.isArray(saved.log) ? saved.log.slice(-8) : [];
  } catch { /* 损坏的旧记录不应阻塞启动 */ }
}

function renderStats() {
  const rows = [
    ["心情", state.mood, "", "mood"],
    ["饱腹", state.hunger, "green", "hunger"],
    ["活力", state.energy, "blue", "energy"],
  ];
  $("stats").innerHTML = rows.map(([label, value, color, key]) => `<div class="stat-line"><span>${label}</span><div class="bar"><i class="${color}" style="width:${value}%"></i></div><strong>${value}</strong></div>`).join("");
  const mood = state.mood >= 75 ? ["😊", "心情不错"] : state.mood >= 45 ? ["🙂", "平平稳稳"] : ["🥺", "需要安慰"];
  $("mood-emoji").textContent = mood[0];
  $("mood-label").textContent = mood[1];
  $("streak-label").textContent = `今日互动 ${state.interactions} 次`;
}

function renderLog() {
  const log = $("activity-log");
  if (!state.log.length) { log.innerHTML = '<li class="empty-log">还没有记录，先和泰迪打个招呼吧。</li>'; return; }
  log.innerHTML = state.log.slice(-8).map((entry) => `<li><span>${entry.emoji} ${entry.label}</span><time>${entry.time}</time></li>`).join("");
}

function setSpeech(text) {
  speech.textContent = text;
  speech.classList.remove("pop");
  void speech.offsetWidth;
  speech.classList.add("pop");
}

function burst(emoji) {
  const item = document.createElement("span");
  item.className = "spark";
  item.textContent = emoji;
  item.style.left = `${38 + Math.random() * 24}%`;
  item.style.top = `${30 + Math.random() * 25}%`;
  $("sparkles").append(item);
  window.setTimeout(() => item.remove(), 950);
}

function burstHeartFx() {
  if (!catalog.fxHeart.length) { burst("🤎"); return; }
  const item = document.createElement("img");
  item.className = "spark fx-spark";
  item.alt = "";
  item.src = assetUrl(catalog.fxHeart[0]);
  item.style.left = "35%";
  item.style.top = "25%";
  $("sparkles").append(item);
  let frame = 0;
  const timer = window.setInterval(() => {
    frame += 1;
    if (frame >= catalog.fxHeart.length) { window.clearInterval(timer); item.remove(); return; }
    item.src = assetUrl(catalog.fxHeart[frame]);
  }, 150);
}

function assetUrl(file) {
  if (!file) return "";
  return file.startsWith("assets/") ? file : `assets/${file}`;
}

function performAction(id) {
  const action = ACTIONS[id];
  if (!action) return;
  state.mood = clamp(state.mood + action.mood);
  state.hunger = clamp(state.hunger + action.hunger);
  state.energy = clamp(state.energy + action.energy);
  state.interactions += 1;
  if (id === "play") state.expressionId = "excited";
  if (id === "pet" || id === "feed") state.expressionId = "happy";
  state.log.push({ label: action.label, emoji: action.emoji, time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) });
  saveState();
  setSpeech(action.message);
  if (id === "feed") showProp(catalog.props.bowl?.full || catalog.props.bowl?.empty);
  else if (id === "play") showProp(catalog.props.ball);
  else hideProp();
  if (id === "pet" || id === "feed") burstHeartFx(); else burst(action.fx);
  renderPet();
  renderStats();
  renderLog();
}

function yawForPose(id) {
  const match = id.match(/y([LRC])(\d{2})/);
  if (!match) return 0;
  return (match[1] === "L" ? -1 : match[1] === "R" ? 1 : 0) * Number(match[2]);
}

function renderPet() {
  const expression = catalog.expressions[state.expressionId];
  const expressionFile = expression?.[state.poseId];
  const pose = catalog.poses.find((item) => item.id === state.poseId) || DEFAULT_POSES[0];
  petImage.src = expressionFile || pose.file;
  petImage.alt = `泰迪犬，${pose.label}，${EXPRESSION_LABELS[state.expressionId] || "中性"}表情`;
  $("pose-select").value = pose.id;
  $("expression-select").value = state.expressionId;
}

function loadPose(pose) {
  state.poseId = pose.id;
  renderPet();
}

function showProp(file) {
  const image = $("prop-image");
  if (!file) { hideProp(); return; }
  image.src = assetUrl(file);
  image.classList.add("visible");
}

function hideProp() {
  const image = $("prop-image");
  image.classList.remove("visible");
  image.removeAttribute("src");
}

function renderLayers() {
  const preview = $("layer-preview");
  Object.entries(catalog.layers).forEach(([part, file]) => {
    const image = preview.querySelector(`[data-layer="${part}"]`);
    if (image) image.src = assetUrl(file);
  });
}

function reset() {
  Object.assign(state, { mood: 78, hunger: 64, energy: 82, interactions: 0, expressionId: "neutral", log: [] });
  saveState();
  hideProp();
  $("layer-preview").classList.remove("visible");
  $("layer-preview").setAttribute("aria-hidden", "true");
  $("layer-toggle").setAttribute("aria-pressed", "false");
  loadPose(catalog.poses[0] || DEFAULT_POSES[0]);
  setSpeech("嗨！今天也要一起玩呀。");
  renderStats();
  renderLog();
}

async function boot() {
  let poses = DEFAULT_POSES;
  try {
    const response = await fetch("assets/manifest.json");
    if (response.ok) {
      const manifest = await response.json();
      const manifestPoses = manifest?.characters?.poodle?.poses?.filter((pose) => pose.file && pose.status !== "todo");
      if (manifestPoses?.length) {
        // manifest paths are rooted at assets/; normalize them for the web page root.
        const indexed = manifestPoses.map((pose) => ({
          ...pose,
          label: pose.id,
          file: assetUrl(pose.file),
        }));
        const known = new Set(indexed.map((pose) => pose.id));
        // Keep generated files that are already present on disk even when the
        // checklist has not been updated with their final manifest entry yet.
        poses = [...indexed, ...DEFAULT_POSES.filter((pose) => !known.has(pose.id))];
      }
      catalog.poses = poses;
      const expressions = manifest?.characters?.poodle?.expressions || [];
      expressions.forEach((entry) => {
        if (!entry.files?.length || !entry.poses?.length) return;
        catalog.expressions[entry.id] = {};
        entry.poses.forEach((poseId, index) => { catalog.expressions[entry.id][poseId] = assetUrl(entry.files[index]); });
      });
      const heart = manifest?.fx?.find((entry) => entry.id === "fx_heart");
      catalog.fxHeart = heart?.files || [];
      const props = manifest?.props || [];
      props.forEach((entry) => { catalog.props[entry.id] = typeof entry.file === "string" ? entry.file : entry.file || null; });
      catalog.layers = manifest?.characters?.poodle?.layers?.sets?.find((set) => set.pose === "yC00_pC00")?.files || {};
    }
    $("connection").classList.add("ready");
    $("connection").innerHTML = '<span class="status-dot"></span>素材已就绪';
  } catch {
    $("connection").innerHTML = '<span class="status-dot"></span>使用本地素材';
  }
  const select = $("pose-select");
  catalog.poses = poses;
  select.innerHTML = poses.map((pose) => `<option value="${pose.id}">${pose.label}</option>`).join("");
  select.addEventListener("change", () => { loadPose(poses.find((pose) => pose.id === select.value) || poses[0]); saveState(); });
  const expressionSelect = $("expression-select");
  expressionSelect.innerHTML = Object.entries(EXPRESSION_LABELS).map(([id, label]) => `<option value="${id}">${label}</option>`).join("");
  expressionSelect.addEventListener("change", () => { state.expressionId = expressionSelect.value; renderPet(); saveState(); });
  $("actions").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (button) performAction(button.dataset.action);
  });
  $("clear-log").addEventListener("click", () => { state.log = []; saveState(); renderLog(); setSpeech("记录清空啦，我们重新开始吧。"); });
  $("reset-button").addEventListener("click", reset);
  $("layer-toggle").addEventListener("click", () => {
    const button = $("layer-toggle");
    const visible = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(visible));
    $("layer-preview").classList.toggle("visible", visible);
    $("layer-preview").setAttribute("aria-hidden", String(!visible));
    setSpeech(visible ? "这是当前导入的分层叠加预览。" : "已恢复整图预览。");
  });
  stage.addEventListener("pointermove", (event) => {
    const rect = stage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - .5;
    const y = (event.clientY - rect.top) / rect.height - .5;
    const yaw = yawForPose(state.poseId);
    petWrap.style.transform = `translate(${x * 7}px, ${y * 4}px) rotate(${x * 1.2}deg)`;
  });
  stage.addEventListener("pointerleave", () => { petWrap.style.transform = ""; });
  restoreState();
  renderLayers();
  loadPose(poses.find((pose) => pose.id === state.poseId) || poses[0]);
  renderStats();
  renderLog();
}

boot();
