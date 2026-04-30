// ── Firebase Config ──────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, deleteDoc,
  onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA6gHbHb4Gp0y5bmDOp_JJVhuxPQARWpJM",
  authDomain: "runbank03.firebaseapp.com",
  databaseURL: "https://runbank03-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "runbank03",
  storageBucket: "runbank03.firebasestorage.app",
  messagingSenderId: "973280333324",
  appId: "1:973280333324:web:0426d89a943f5732a26829"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ── Activity Config ───────────────────────────────────────────────────
const EVENT_ID = "event03";
const TARGET_KCAL = 5000;

// ✅ 里程回報開放日期（台灣時間 2026/5/1 00:00:00）
const REPORT_OPEN_DATE = new Date("2026-05-01T00:00:00+08:00");

// 組員名單
const ALL_MEMBERS = [
  "ames Liu", "angle卿 💕💫", "佳宜*雞蛋花", "傑克", "泰淼",
  "科銘", "臣賢", "議德", "鄭伯", "鄭宏洋",
  "陳一郎", "陳弘明", "雷皇正", "高聖智", "蔡若瑋"
];

// ── State ─────────────────────────────────────────────────────────────
let registrations = [];
let reports = [];
let editingId = null;
let currentTab = "register";

// ── 里程回報是否開放 ──────────────────────────────────────────────────
function isReportOpen() {
  return new Date() >= REPORT_OPEN_DATE;
}

// ── Calorie Formula ───────────────────────────────────────────────────
function calcKcal(km) {
  const whole = Math.floor(km);
  const dec = km - whole;
  const rounded = dec > 0.11 ? whole + 1 : whole;
  if (rounded < 5) return 0;
  return 350 + (rounded - 5) * 70;
}

// ── Firebase Listeners ────────────────────────────────────────────────
function startListeners() {
  // ✅ 先用靜態名單渲染一次，Firebase 未返回前下拉就有人可選
  renderDropdowns();
  renderReportLockUI();

  const regRef = collection(db, EVENT_ID, "data", "registrations");
  onSnapshot(query(regRef, orderBy("createdAt")), snap => {
    registrations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  }, err => {
    console.error("Firestore registrations 錯誤:", err);
    showToast("⚠️ Firebase 連線失敗，請確認 Firestore 規則");
  });

  const repRef = collection(db, EVENT_ID, "data", "reports");
  onSnapshot(query(repRef, orderBy("createdAt")), snap => {
    reports = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  }, err => {
    console.error("Firestore reports 錯誤:", err);
  });
}

// ── Render ────────────────────────────────────────────────────────────
function render() {
  renderProgress();
  renderDropdowns();
  renderMemberList();
  renderReportLockUI();
}

// ✅ 回報鎖定 UI 控制
function renderReportLockUI() {
  const locked = !isReportOpen();
  const lockBanner = document.getElementById("reportLockBanner");
  const formInner = document.getElementById("reportFormInner");
  if (lockBanner) lockBanner.style.display = locked ? "flex" : "none";
  if (formInner) formInner.style.display = locked ? "none" : "block";
}

function renderProgress() {
  let total = 0;
  let sublabel = "實際罷工能量";

  if (currentTab === "register") {
    total = registrations.reduce((s, r) => {
      const km = parseFloat(r.plannedKm) || 0;
      return s + calcKcal(km);
    }, 0);
    sublabel = "預計罷工能量";
  } else {
    total = reports.reduce((s, r) => s + (r.kcal || 0), 0);
    sublabel = "實際罷工能量";
  }

  document.getElementById("totalKcal").textContent = total.toLocaleString();
  document.getElementById("progressSublabel").textContent = sublabel;

  const pct = Math.min((total / TARGET_KCAL) * 100, 100);
  const bar = document.getElementById("progressBar");
  bar.style.width = (pct > 0 ? Math.max(pct, 10) : 0) + "%";
  bar.classList.toggle("full", total >= TARGET_KCAL);

  document.getElementById("successMsg").classList.toggle("show", total >= TARGET_KCAL);
}

function renderDropdowns() {
  const registeredNames = new Set(registrations.map(r => r.name));
  const reportedNames = new Set(reports.map(r => r.name));

  // 報名下拉：從靜態 ALL_MEMBERS 過濾已報名者
  const regSelect = document.getElementById("registerName");
  const regVal = regSelect.value;
  regSelect.innerHTML = '<option value="">請選取組員...</option>';
  const regAvailable = ALL_MEMBERS.filter(n => !registeredNames.has(n));
  regAvailable.forEach(n => {
    regSelect.innerHTML += `<option value="${n}">${n}</option>`;
  });
  if (regAvailable.includes(regVal)) regSelect.value = regVal;
  document.getElementById("slotsLeft").textContent = `剩 ${regAvailable.length} 位組員`;

  // 里程回報下拉：已報名但未回報的人
  const repSelect = document.getElementById("reportName");
  const repVal = repSelect.value;
  repSelect.innerHTML = '<option value="">請選取組員...</option>';
  const repAvailable = registrations.filter(r => !reportedNames.has(r.name)).map(r => r.name);
  repAvailable.forEach(n => {
    repSelect.innerHTML += `<option value="${n}">${n}</option>`;
  });
  if (repAvailable.includes(repVal)) repSelect.value = repVal;
  document.getElementById("reportSlotsLeft").textContent = `剩 ${repAvailable.length} 位組員`;
}

function renderMemberList() {
  const list = document.getElementById("membersList");
  const reportedNames = new Set(reports.map(r => r.name));

  const items = [
    ...reports.map(r => ({ type: "report", data: r })),
    ...registrations
      .filter(r => !reportedNames.has(r.name))
      .map(r => ({ type: "reg", data: r }))
  ];

  if (items.length === 0) {
    list.innerHTML = '<p class="empty-state">還沒有組員報名 💪</p>';
    return;
  }

  list.innerHTML = items.map(item => {
    if (item.type === "report") {
      const r = item.data;
      const char = r.name.charAt(0);
      const safeName = r.name.replace(/'/g, "\\'");
      return `
        <div class="member-card" data-id="${r.id}" data-type="report">
          <div class="avatar">${char}</div>
          <div class="member-info">
            <div class="member-name">${r.name}</div>
            <div class="member-km">${r.actualKm}K → ${r.actualKm}K</div>
          </div>
          <div class="member-kcal">${r.kcal} <small>KCAL</small></div>
          <div class="member-actions">
            <button class="icon-btn" onclick="openEdit('${r.id}', '${safeName}', ${r.actualKm})" title="編輯">✏️</button>
            <button class="icon-btn del" onclick="deleteReport('${r.id}')" title="刪除">🗑️</button>
          </div>
        </div>`;
    } else {
      const r = item.data;
      const char = r.name.charAt(0);
      return `
        <div class="member-card registered" data-id="${r.id}" data-type="reg">
          <div class="avatar">${char}</div>
          <div class="member-info">
            <div class="member-name">${r.name}</div>
            <div class="member-km">預計 ${r.plannedKm}K</div>
          </div>
          <div class="member-kcal" style="color:var(--gray)">—</div>
          <div class="member-actions">
            <button class="icon-btn del" onclick="deleteRegistration('${r.id}')" title="刪除報名">🗑️</button>
          </div>
        </div>`;
    }
  }).join("");
}

// ── Submit Actions ────────────────────────────────────────────────────
window.submitRegister = async function () {
  const name = document.getElementById("registerName").value;
  const km = parseFloat(document.getElementById("registerKm").value);
  if (!name) { showToast("請選取組員"); return; }
  if (!km || km <= 0) { showToast("請輸入有效里程"); return; }

  const btn = document.getElementById("submitRegister");
  btn.disabled = true;
  try {
    const ref = collection(db, EVENT_ID, "data", "registrations");
    await addDoc(ref, { name, plannedKm: km, createdAt: Date.now() });
    document.getElementById("registerKm").value = "";
    document.getElementById("registerName").value = "";
    showToast(`✅ ${name} 報名成功！`);
  } catch (e) {
    showToast("送出失敗，請確認 Firebase 規則設定");
    console.error(e);
  }
  btn.disabled = false;
};

window.submitReport = async function () {
  // ✅ 5/1 前鎖定
  if (!isReportOpen()) {
    showToast("⛔ 請於 5/1 再開始回報里程");
    return;
  }
  const name = document.getElementById("reportName").value;
  const km = parseFloat(document.getElementById("reportKm").value);
  if (!name) { showToast("請選取組員"); return; }
  if (!km || km <= 0) { showToast("請輸入有效里程"); return; }

  const kcal = calcKcal(km);
  if (kcal === 0) { showToast("里程未達 5K，無法計入熱量"); return; }

  try {
    const ref = collection(db, EVENT_ID, "data", "reports");
    await addDoc(ref, { name, actualKm: km, kcal, createdAt: Date.now() });
    document.getElementById("reportKm").value = "";
    document.getElementById("reportName").value = "";
    showToast(`🔥 ${name} 送出 ${kcal} kcal！`);
  } catch (e) {
    showToast("送出失敗，請稍後再試");
    console.error(e);
  }
};

// ── Edit / Delete ─────────────────────────────────────────────────────
window.openEdit = function (id, name, km) {
  if (!isReportOpen()) {
    showToast("⛔ 請於 5/1 再開始回報里程");
    return;
  }
  editingId = id;
  document.getElementById("editName").textContent = name;
  document.getElementById("editKm").value = km;
  document.getElementById("editModal").style.display = "flex";
};

window.closeModal = function (e) {
  if (e && e.target !== document.getElementById("editModal")) return;
  document.getElementById("editModal").style.display = "none";
  editingId = null;
};

window.saveEdit = async function () {
  if (!editingId) return;
  if (!isReportOpen()) { showToast("⛔ 請於 5/1 再開始回報里程"); return; }
  const km = parseFloat(document.getElementById("editKm").value);
  if (!km || km <= 0) { showToast("請輸入有效里程"); return; }
  const kcal = calcKcal(km);
  try {
    const ref = doc(db, EVENT_ID, "data", "reports", editingId);
    await setDoc(ref, { actualKm: km, kcal }, { merge: true });
    document.getElementById("editModal").style.display = "none";
    editingId = null;
    showToast("✅ 已更新里程");
  } catch (e) {
    showToast("更新失敗");
    console.error(e);
  }
};

window.deleteReport = async function (id) {
  if (!confirm("確定要刪除這筆里程紀錄嗎？")) return;
  try {
    await deleteDoc(doc(db, EVENT_ID, "data", "reports", id));
    showToast("已刪除");
  } catch (e) {
    showToast("刪除失敗");
    console.error(e);
  }
};

window.deleteRegistration = async function (id) {
  if (!confirm("確定要取消報名嗎？")) return;
  try {
    await deleteDoc(doc(db, EVENT_ID, "data", "registrations", id));
    showToast("已取消報名");
  } catch (e) {
    showToast("刪除失敗");
    console.error(e);
  }
};

// ── Tab Switch ────────────────────────────────────────────────────────
window.switchTab = function (tab) {
  currentTab = tab;
  document.getElementById("formRegister").style.display = tab === "register" ? "block" : "none";
  document.getElementById("formReport").style.display = tab === "report" ? "block" : "none";
  document.getElementById("tabRegister").classList.toggle("active", tab === "register");
  document.getElementById("tabReport").classList.toggle("active", tab === "report");
  renderProgress();
  renderReportLockUI();
};

// ── Toast ─────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2800);
}

// ── Init ──────────────────────────────────────────────────────────────
startListeners();
