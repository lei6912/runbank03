// ── Firebase ──────────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, deleteDoc, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA6gHbHb4Gp0y5bmDOp_JJVhuxPQARWpJM",
  authDomain: "runbank03.firebaseapp.com",
  projectId: "runbank03",
  storageBucket: "runbank03.firebasestorage.app",
  messagingSenderId: "973280333324",
  appId: "1:973280333324:web:0426d89a943f5732a26829"
};
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ── 設定 ──────────────────────────────────────────────────────────────
const REG_COL   = "event04_registrations";   // 團結日02 報名
const REP_COL   = "event04_reports";         // 團結日02 里程回報
const SET_COL   = "event04_settings";        // 順子分配設定
const SET_ID    = "straights";
const DAYS      = ["9/5", "9/6"];
const MIN_K     = 5;                          // 順子最小起始 K
const STRAIGHT_LEN = 5;
const MAX_GROUPS   = 6;
const REPORT_OPEN_DATE = new Date("2026-09-05T00:00:00+08:00");

const ALL_MEMBERS = [
  "佳宜*雞蛋花", "志隆", "臣賢", "鄭伯", "鄭宏洋",
  "高聖智", "阿耀（＾∇＾）", "陳弘明", "雷皇正", "蔡若瑋"
];

// ── State ─────────────────────────────────────────────────────────────
let registrations = [];
let reports       = [];
let settings      = { mode: "auto", assignments: {} };
let currentTab    = "register";
let registerDay   = "";
let editing       = null;   // { type: "report"|"reg", id, name, day }
let isSubmitting  = false;

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ── 規則 ──────────────────────────────────────────────────────────────
function isReportOpen() { return new Date() >= REPORT_OPEN_DATE; }

// 5421 跑銀進位：小數 > 0.11 進位
function roundK(km) {
  const whole = Math.floor(km);
  const dec   = parseFloat((km - whole).toFixed(10));
  return dec > 0.11 ? whole + 1 : whole;
}

function pointsFor(n) { return n === 0 ? 0 : 2 + (n - 1); }

// 卡片：{ id, name, day, k, raw }
function cardsFromRegistrations() {
  return registrations.map(r => ({ id: r.id, name: r.name, day: r.day, k: roundK(parseFloat(r.plannedKm) || 0), raw: r.plannedKm }));
}
function cardsFromReports() {
  return reports.map(r => ({ id: r.id, name: r.name, day: r.day, k: r.k, raw: r.actualKm }));
}

// 自動湊順子（由最小 K 開始貪婪，可證明能得到最多組數）
function computeStraights(cards) {
  const pool = cards.filter(c => c.k >= MIN_K).sort((a, b) => a.k - b.k);
  const straights = [];
  while (pool.length) {
    const first = pool[0];
    const picks = [first];
    let ok = true;
    for (let w = first.k + 1; w < first.k + STRAIGHT_LEN; w++) {
      const c = pool.find(x => x.k === w);
      if (!c) { ok = false; break; }
      picks.push(c);
    }
    if (ok) {
      straights.push(picks);
      picks.forEach(p => pool.splice(pool.indexOf(p), 1));
    } else {
      pool.shift();
    }
  }
  const usedIds = new Set(straights.flat().map(c => c.id));
  const unused  = cards.filter(c => !usedIds.has(c.id));
  return { straights, unused };
}

// 手動分組結果
function manualStraights(cards) {
  const groups = {};
  const unused = [];
  cards.forEach(c => {
    const g = settings.assignments?.[c.id];
    if (g) (groups[g] = groups[g] || []).push(c); else unused.push(c);
  });
  const list = Object.keys(groups).map(Number).sort((a, b) => a - b).map(g => {
    const cs = groups[g].sort((a, b) => a.k - b.k);
    const ks = cs.map(c => c.k);
    const valid = cs.length === STRAIGHT_LEN && ks[0] >= MIN_K && ks.every((k, i) => i === 0 || k === ks[i - 1] + 1);
    return { group: g, cards: cs, valid };
  });
  return { groups: list, unused };
}

// 差一張就能再湊一組的提示
function nearMisses(unused) {
  const have = new Set(unused.filter(c => c.k >= MIN_K).map(c => c.k));
  if (!have.size) return [];
  const maxK = Math.max(...have);
  const out = new Set();
  for (let v = MIN_K; v <= maxK; v++) {
    const missing = [];
    for (let w = v; w < v + STRAIGHT_LEN; w++) if (!have.has(w)) missing.push(w);
    if (missing.length === 1) out.add(missing[0]);
  }
  return [...out].sort((a, b) => a - b);
}

// ── Firebase 監聽 ─────────────────────────────────────────────────────
function startListeners() {
  renderDropdowns();
  renderLockUI();

  onSnapshot(query(collection(db, REG_COL), orderBy("createdAt")),
    snap => { registrations = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); setBtn("submitRegister", false, "確認送出報名"); },
    err  => { console.error(err); showToast("⚠️ Firebase 連線失敗，請確認 Firestore 規則"); setBtn("submitRegister", false, "確認送出報名"); }
  );
  onSnapshot(query(collection(db, REP_COL), orderBy("createdAt")),
    snap => { reports = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); setBtn("submitReport", false, "確認送出里程"); },
    err  => console.error(err)
  );
  onSnapshot(doc(db, SET_COL, SET_ID),
    snap => { if (snap.exists()) settings = { mode: "auto", assignments: {}, ...snap.data() }; render(); },
    err  => console.error(err)
  );
}

function setBtn(id, loading, label) {
  const b = $(id); if (!b) return;
  b.disabled = loading;
  b.textContent = loading ? "送出中..." : label;
}

// ── Render ────────────────────────────────────────────────────────────
function render() {
  renderProgress();
  renderDropdowns();
  renderMemberList();
  renderLockUI();
}

function renderLockUI() {
  const locked = !isReportOpen();
  $("reportLockBanner").style.display = locked ? "flex" : "none";
  $("reportFormInner").style.display  = locked ? "none" : "block";
}

function pcardHTML(c, i, extraClass = "") {
  const color = i % 2 === 0 ? "" : "p";
  const dayCls = c.day === "9/6" ? "d2" : "";
  return `
    <div class="pcard ${color} ${extraClass}" title="${esc(c.name)} ${esc(c.day)} ${c.raw}K → ${c.k}K">
      <span class="corner">${c.k}</span>
      <span class="k">${c.k}K</span>
      <span class="who">${esc(c.name)}</span>
      <span class="day ${dayCls}">${esc(c.day)}</span>
      <span class="corner br">${c.k}</span>
    </div>`;
}

function renderProgress() {
  const isReport = currentTab === "report";
  const cards    = isReport ? cardsFromReports() : cardsFromRegistrations();
  const manual   = isReport && settings.mode === "manual";

  $("modeRow").style.display = isReport && isReportOpen() ? "flex" : "none";
  $("modeAuto").classList.toggle("active", settings.mode !== "manual");
  $("modeManual").classList.toggle("active", settings.mode === "manual");
  $("progressSublabel").textContent = isReport ? "實際湊出" : "預計湊出";

  const area = $("straightsArea");
  const pool = $("poolArea");
  const hint = $("hintBox");
  hint.style.display = "none";

  let count = 0;

  if (!cards.length) {
    area.innerHTML = `<p class="empty-state">${isReport ? "還沒有人回報里程 🏃" : "還沒有組員報名，快來抽第一張 K 卡 🃏"}</p>`;
    pool.innerHTML = "";
  } else if (manual) {
    const { groups, unused } = manualStraights(cards);
    count = groups.filter(g => g.valid).length;
    area.innerHTML = groups.map(g => `
      <div class="straight ${g.valid ? "" : "invalid"}">
        <div class="straight-head">
          <span class="tag">${g.valid ? "✔ 順子" : "✖ 未成立"} #${g.group}</span>
          <span class="range">${g.cards.map(c => c.k + "K").join(" · ")}</span>
        </div>
        <div class="hand">${g.cards.map((c, i) => pcardHTML(c, i)).join("")}</div>
      </div>`).join("") || `<p class="empty-state">請在下方為每張 K 卡指定組別</p>`;

    const all = [...cards].sort((a, b) => a.k - b.k);
    pool.innerHTML = `
      <div class="pool-title"><span>✋ 手動分配（每張卡只能用在一組）</span><span>${unused.length} 張未使用</span></div>
      <div class="assign-list">
        ${all.map((c, i) => `
          <div class="assign-row">
            <div class="mini ${i % 2 ? "p" : ""}">${c.k}K</div>
            <div class="info">
              <div class="nm">${esc(c.name)}</div>
              <div class="sub">${esc(c.day)} · ${c.raw}K</div>
            </div>
            <select data-assign="${c.id}">
              <option value="">— 不用</option>
              ${Array.from({ length: MAX_GROUPS }, (_, k) => k + 1).map(g =>
                `<option value="${g}" ${settings.assignments?.[c.id] == g ? "selected" : ""}>第 ${g} 組</option>`).join("")}
            </select>
          </div>`).join("")}
      </div>`;
  } else {
    const { straights, unused } = computeStraights(cards);
    count = straights.length;
    area.innerHTML = straights.map((s, gi) => `
      <div class="straight" style="animation-delay:${gi * 80}ms">
        <div class="straight-head">
          <span class="tag">✔ 順子 #${gi + 1}</span>
          <span class="range">${s[0].k}K → ${s[4].k}K</span>
        </div>
        <div class="hand">${s.map((c, i) => pcardHTML(c, i)).join("")}</div>
      </div>`).join("") || `<p class="empty-state">還沒湊成順子，繼續集卡 💪</p>`;

    pool.innerHTML = unused.length ? `
      <div class="pool-title"><span>🃏 手上還有的卡</span><span>${unused.length} 張</span></div>
      <div class="pool">${[...unused].sort((a, b) => a.k - b.k).map((c, i) => pcardHTML(c, i, c.k < MIN_K ? "dim" : "")).join("")}</div>` : "";

    const miss = nearMisses(unused);
    if (miss.length) {
      hint.style.display = "block";
      hint.innerHTML = `💡 只差一張！再來一張 ${miss.map(k => `<b>${k}K</b>`).join(" 或 ")} 就能再多湊一組順子。`;
    }
  }

  $("straightCount").textContent = count;
  $("pointCount").textContent    = pointsFor(count);
}

function renderDropdowns() {
  // 報名：某人若兩天都報了就不列出
  const regKey = new Set(registrations.map(r => r.name + "|" + r.day));
  const regSel = $("registerName");
  const prev   = regSel.value;
  const avail  = ALL_MEMBERS.filter(n => !DAYS.every(d => regKey.has(n + "|" + d)));
  regSel.innerHTML = '<option value="">請選取組員...</option>' +
    avail.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
  if (avail.includes(prev)) regSel.value = prev;
  const noReg = ALL_MEMBERS.filter(n => !registrations.some(r => r.name === n)).length;
  $("slotsLeft").textContent = `剩 ${noReg} 位未報名`;
  updateDayPills();

  // 回報：列出尚未回報的 (姓名, 日期)
  const repKey = new Set(reports.map(r => r.name + "|" + r.day));
  const repSel = $("reportTarget");
  const prevR  = repSel.value;
  const pending = registrations.filter(r => !repKey.has(r.name + "|" + r.day));
  repSel.innerHTML = '<option value="">請選取組員...</option>' +
    pending.map(r => `<option value="${esc(r.name)}|${esc(r.day)}">${esc(r.name)}　${esc(r.day)}（預計 ${r.plannedKm}K）</option>`).join("");
  if (pending.some(r => r.name + "|" + r.day === prevR)) repSel.value = prevR;
  $("reportSlotsLeft").textContent = `剩 ${pending.length} 筆未回報`;
}

function updateDayPills() {
  const name = $("registerName").value;
  document.querySelectorAll("#registerDayPills .day-pill").forEach(p => {
    const taken = name && registrations.some(r => r.name === name && r.day === p.dataset.day);
    p.disabled = !!taken;
    if (taken && registerDay === p.dataset.day) registerDay = "";
    p.classList.toggle("active", registerDay === p.dataset.day);
  });
}

function renderMemberList() {
  const list = $("membersList");
  const repMap = new Map(reports.map(r => [r.name + "|" + r.day, r]));
  const rows = [...registrations].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant") || a.day.localeCompare(b.day));

  if (!rows.length) { list.innerHTML = ""; return; }

  list.innerHTML = rows.map(r => {
    const rep = repMap.get(r.name + "|" + r.day);
    const dayCls = r.day === "9/6" ? "d2" : "";
    const card = rep
      ? `<div class="pcard"><span class="k">${rep.k}K</span></div>`
      : `<div class="pcard blank"><span class="k">?</span></div>`;
    const meta = rep
      ? `<span class="chip ${dayCls}">${esc(r.day)}</span><span class="chip done">已回報</span> 預計 ${r.plannedKm}K → 實跑 ${rep.actualKm}K`
      : `<span class="chip ${dayCls}">${esc(r.day)}</span><span class="chip wait">未回報</span> 預計 ${r.plannedKm}K（${roundK(parseFloat(r.plannedKm) || 0)}K 卡）`;
    const actions = rep
      ? `<button class="icon-btn" data-action="edit-report" data-id="${rep.id}">✏️</button>
         <button class="icon-btn" data-action="del-report" data-id="${rep.id}">🗑️</button>`
      : `<button class="icon-btn" data-action="edit-reg" data-id="${r.id}">✏️</button>
         <button class="icon-btn" data-action="del-reg" data-id="${r.id}">🗑️</button>`;
    return `
      <div class="member-card">
        ${card}
        <div class="member-info">
          <div class="member-name">${esc(r.name)}</div>
          <div class="member-meta">${meta}</div>
        </div>
        <div class="member-actions">${actions}</div>
      </div>`;
  }).join("");
}

// ── 送出報名 ──────────────────────────────────────────────────────────
async function submitRegister() {
  if (isSubmitting) return;
  const name = $("registerName").value;
  const km   = parseFloat($("registerKm").value);
  if (!name) return showToast("請選取組員");
  if (!registerDay) return showToast("請選擇預計跑哪一天");
  if (!km || km <= 0) return showToast("請輸入有效里程");
  if (registrations.some(r => r.name === name && r.day === registerDay)) return showToast("這位組員該天已經報名囉");

  isSubmitting = true;
  setBtn("submitRegister", true);
  try {
    const day = registerDay;
    await addDoc(collection(db, REG_COL), { name, day, plannedKm: km, createdAt: Date.now() });
    $("registerKm").value = ""; $("registerName").value = ""; registerDay = "";
    $("registerPreview").textContent = "　";
    showToast(`✅ ${name} ${day} 報名成功！`);
  } catch (e) {
    console.error(e); showToast("送出失敗，請確認 Firestore 規則已開放讀寫");
    setBtn("submitRegister", false, "確認送出報名");
  } finally { isSubmitting = false; }
}

// ── 送出里程 ──────────────────────────────────────────────────────────
async function submitReport() {
  if (!isReportOpen()) return showToast("⛔ 請於 9/5 再開始回報里程");
  if (isSubmitting) return;
  const target = $("reportTarget").value;
  const km     = parseFloat($("reportKm").value);
  if (!target) return showToast("請選取組員");
  if (!km || km <= 0) return showToast("請輸入有效里程");
  const [name, day] = target.split("|");
  if (reports.some(r => r.name === name && r.day === day)) return showToast("這筆已經回報過囉");

  const k = roundK(km);
  isSubmitting = true;
  setBtn("submitReport", true);
  try {
    await addDoc(collection(db, REP_COL), { name, day, actualKm: km, k, createdAt: Date.now() });
    $("reportKm").value = ""; $("reportTarget").value = "";
    $("reportPreview").textContent = "　";
    showToast(k >= MIN_K ? `🃏 ${name} 抽到 ${k}K 卡！` : `✅ 已記錄 ${name} ${km}K（未達 ${MIN_K}K，無法湊順子）`);
  } catch (e) {
    console.error(e); showToast("送出失敗，請稍後再試");
    setBtn("submitReport", false, "確認送出里程");
  } finally { isSubmitting = false; }
}

// ── 編輯 ──────────────────────────────────────────────────────────────
function openEdit(type, id) {
  const src = type === "report" ? reports.find(r => r.id === id) : registrations.find(r => r.id === id);
  if (!src) return;
  if (type === "report" && !isReportOpen()) return showToast("⛔ 請於 9/5 再開始回報里程");
  editing = { type, id, name: src.name, day: src.day };
  $("editTitle").textContent = type === "report" ? "編輯實際里程" : "編輯預計里程";
  $("editLabel").textContent = type === "report" ? "實際完成里程 (K)" : "預計里程 (K)";
  $("editName").textContent  = `${src.name} · ${src.day}`;
  $("editKm").value = type === "report" ? src.actualKm : src.plannedKm;
  updatePreview("editKm", "editPreview");
  $("editModal").style.display = "flex";
}
function closeModal() { $("editModal").style.display = "none"; editing = null; }

async function saveEdit() {
  if (!editing) return;
  const km = parseFloat($("editKm").value);
  if (!km || km <= 0) return showToast("請輸入有效里程");
  try {
    if (editing.type === "report") {
      await setDoc(doc(db, REP_COL, editing.id), { actualKm: km, k: roundK(km) }, { merge: true });
    } else {
      await setDoc(doc(db, REG_COL, editing.id), { plannedKm: km }, { merge: true });
    }
    closeModal(); showToast("✅ 已更新里程");
  } catch (e) { console.error(e); showToast("更新失敗"); }
}

// ── 刪除 ──────────────────────────────────────────────────────────────
async function deleteReport(id) {
  if (!confirm("確定要刪除這筆里程紀錄嗎？")) return;
  try { await deleteDoc(doc(db, REP_COL, id)); showToast("已刪除里程紀錄"); }
  catch { showToast("刪除失敗"); }
}
async function deleteRegistration(id) {
  const r = registrations.find(x => x.id === id);
  if (r && reports.some(p => p.name === r.name && p.day === r.day)) return showToast("此筆已有回報里程，請先刪除回報紀錄");
  if (!confirm("確定要取消這筆報名嗎？")) return;
  try { await deleteDoc(doc(db, REG_COL, id)); showToast("已取消報名"); }
  catch { showToast("刪除失敗"); }
}

// ── 順子分配模式 ──────────────────────────────────────────────────────
async function setMode(mode) {
  const next = { mode, assignments: { ...(settings.assignments || {}) } };
  // 第一次切到手動，用自動結果當起點
  if (mode === "manual" && !Object.keys(next.assignments).length) {
    const { straights } = computeStraights(cardsFromReports());
    straights.forEach((s, gi) => s.forEach(c => next.assignments[c.id] = gi + 1));
  }
  settings = next;
  render();
  try { await setDoc(doc(db, SET_COL, SET_ID), next); }
  catch (e) { console.error(e); showToast("模式儲存失敗"); }
}
async function setAssignment(id, group) {
  const assignments = { ...(settings.assignments || {}) };
  if (group) assignments[id] = Number(group); else delete assignments[id];
  settings = { ...settings, assignments };
  render();
  try { await setDoc(doc(db, SET_COL, SET_ID), settings); }
  catch (e) { console.error(e); showToast("分配儲存失敗"); }
}

// ── Tab / 預覽 / Toast ───────────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  $("formRegister").style.display = tab === "register" ? "block" : "none";
  $("formReport").style.display   = tab === "report"   ? "block" : "none";
  $("tabRegister").classList.toggle("active", tab === "register");
  $("tabReport").classList.toggle("active",   tab === "report");
  renderProgress(); renderLockUI();
}

function updatePreview(inputId, previewId) {
  const km = parseFloat($(inputId).value);
  const el = $(previewId);
  if (!km || km <= 0) { el.innerHTML = "　"; return; }
  const k = roundK(km);
  el.innerHTML = k >= MIN_K ? `${km}K → 進位後為 <b>${k}K</b> 卡` : `${km}K → <b>${k}K</b>（未達 ${MIN_K}K，無法湊順子）`;
}

function showToast(msg) {
  const t = $("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.remove("show"), 2800);
}

// ── 事件綁定 ──────────────────────────────────────────────────────────
$("tabRegister").addEventListener("click", () => switchTab("register"));
$("tabReport").addEventListener("click",   () => switchTab("report"));
$("submitRegister").addEventListener("click", submitRegister);
$("submitReport").addEventListener("click", submitReport);
$("cancelEdit").addEventListener("click", closeModal);
$("saveEdit").addEventListener("click", saveEdit);
$("editModal").addEventListener("click", e => { if (e.target === $("editModal")) closeModal(); });
$("registerName").addEventListener("change", updateDayPills);
$("registerKm").addEventListener("input", () => updatePreview("registerKm", "registerPreview"));
$("reportKm").addEventListener("input",   () => updatePreview("reportKm", "reportPreview"));
$("editKm").addEventListener("input",     () => updatePreview("editKm", "editPreview"));
$("modeAuto").addEventListener("click",   () => setMode("auto"));
$("modeManual").addEventListener("click", () => setMode("manual"));

$("registerDayPills").addEventListener("click", e => {
  const p = e.target.closest(".day-pill");
  if (!p || p.disabled) return;
  registerDay = p.dataset.day;
  updateDayPills();
});

$("membersList").addEventListener("click", e => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const { action, id } = b.dataset;
  if (action === "edit-report") openEdit("report", id);
  if (action === "edit-reg")    openEdit("reg", id);
  if (action === "del-report")  deleteReport(id);
  if (action === "del-reg")     deleteRegistration(id);
});

$("poolArea").addEventListener("change", e => {
  const s = e.target.closest("select[data-assign]");
  if (s) setAssignment(s.dataset.assign, s.value);
});

// ── 初始化 ────────────────────────────────────────────────────────────
startListeners();
