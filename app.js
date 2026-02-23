const DOC_NAME = "trades_v1";
const $ = (id) => document.getElementById(id);

function setStatus(text) {
  const el = $("syncStatus");
  if (el) el.textContent = text;
}

function formatNum(n) {
  if (n === "" || n === null || n === undefined || Number.isNaN(n)) return "";
  const x = Number(n);
  return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function avg(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

/* ---------- Date keys ---------- */

function getWeekKey(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function getMonthKey(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/* ---------- Cloud storage ---------- */

function hasCloud() {
  return !!(window.__CLOUD__ && window.__CLOUD__.ready);
}

async function cloudLoadTrades() {
  const snap = await window.__CLOUD__.getDoc(window.__CLOUD__.doc(DOC_NAME));
  if (!snap.exists()) return [];
  const data = snap.data();
  return Array.isArray(data.trades) ? data.trades : [];
}

async function cloudSaveTrades(trades) {
  await window.__CLOUD__.setDoc(window.__CLOUD__.doc(DOC_NAME), { trades }, { merge: true });
}

// Optional local backup (offline)
function localLoadTrades() {
  try { return JSON.parse(localStorage.getItem(DOC_NAME)) || []; }
  catch { return []; }
}
function localSaveTrades(trades) {
  localStorage.setItem(DOC_NAME, JSON.stringify(trades));
}

async function loadTrades() {
  if (hasCloud()) {
    const t = await cloudLoadTrades();
    localSaveTrades(t);
    return t;
  }
  return localLoadTrades();
}

async function saveTrades(trades) {
  localSaveTrades(trades);
  if (hasCloud()) await cloudSaveTrades(trades);
}

/* ---------- Profit/Loss type logic ---------- */

function getSignedPL() {
  const type = $("resultType").value;
  const amount = Number($("resultAmount").value || 0);
  if (!type || amount === 0) return 0;

  if (type === "PROFIT") return +Math.abs(amount);
  if (type === "LOSS") return -Math.abs(amount);
  return 0;
}

function autoFillEquityAfter() {
  const eqBefore = Number($("equityBefore").value || 0);
  if (!eqBefore) return;

  const pl = getSignedPL();
  const nextEq = eqBefore + pl;
  $("equityAfter").value = String(Number.isFinite(nextEq) ? round2(nextEq) : "");
}

/* ---------- Filters ---------- */

function readFilters() {
  return {
    pair: $("filterPair").value.trim(),
    session: $("filterSession").value.trim(),
    direction: $("filterDirection").value.trim(),
    from: $("filterFrom").value,
    to: $("filterTo").value
  };
}

function applyFilters(trades) {
  const f = readFilters();
  return trades.filter(t => {
    if (f.pair && String(t.pair || "").toLowerCase() !== f.pair.toLowerCase()) return false;
    if (f.session && String(t.session || "") !== f.session) return false;
    if (f.direction && String(t.direction || "") !== f.direction) return false;

    if (f.from && t.date && t.date < f.from) return false;
    if (f.to && t.date && t.date > f.to) return false;

    return true;
  });
}

function rebuildPairFilterOptions(allTrades) {
  const sel = $("filterPair");
  const current = sel.value;

  const pairs = new Set();
  for (const t of allTrades) {
    const p = (t.pair || "").trim();
    if (p) pairs.add(p);
  }
  const sorted = [...pairs].sort((a, b) => a.localeCompare(b));

  sel.innerHTML =
    `<option value="">All</option>` +
    sorted.map(p => {
      const safe = escapeHtml(p);
      return `<option value="${safe}">${safe}</option>`;
    }).join("");

  if (sorted.includes(current)) sel.value = current;
  else sel.value = "";
}

/* ---------- Analytics render helpers ---------- */

function renderPeriodBox(trades, keyFn, boxId, label) {
  const byKey = new Map();
  const asc = [...trades].sort((a, b) => (a.date > b.date ? 1 : -1));

  for (const t of asc) {
    const k = keyFn(t.date);
    if (!k) continue;

    if (!byKey.has(k)) byKey.set(k, { pl: 0, startEquity: null });
    const g = byKey.get(k);

    const pl = Number(t.pl) || 0;
    g.pl += pl;

    if (g.startEquity === null && t.equityBefore !== "" && t.equityBefore != null) {
      g.startEquity = Math.max(0.000001, Number(t.equityBefore) || 0);
    }
  }

  const items = [...byKey.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  const box = $(boxId);
  box.innerHTML = items.length ? "" : `<div class="small">No data yet.</div>`;

  for (const [k, g] of items) {
    const pct = g.startEquity ? (g.pl / g.startEquity) * 100 : null;

    const div = document.createElement("div");
    div.className = "kpi";
    div.innerHTML = `
      <div class="small">${label}: ${escapeHtml(k)}</div>
      <div class="v ${g.pl >= 0 ? "good" : "bad"}">${(g.pl >= 0 ? "+" : "") + formatNum(g.pl)}</div>
      <div class="small">Profit %: <b>${pct === null ? "—" : pct.toFixed(2) + "%"}</b></div>
    `;
    box.appendChild(div);
  }
}

function renderGroupBox(trades, key, boxId, label) {
  const groups = new Map();

  for (const t of trades) {
    const raw = (t[key] ?? "Unknown");
    const k = (typeof raw === "string") ? (raw.trim() || "Unknown") : String(raw);
    if (!groups.has(k)) groups.set(k, { pl: 0, count: 0, wins: 0 });

    const g = groups.get(k);
    const pl = Number(t.pl) || 0;

    g.pl += pl;
    g.count += 1;
    if (pl > 0) g.wins += 1;
  }

  const items = [...groups.entries()].sort((a, b) => b[1].pl - a[1].pl);
  const box = $(boxId);
  box.innerHTML = items.length ? "" : `<div class="small">No data yet.</div>`;

  for (const [k, g] of items) {
    const winRate = g.count ? (g.wins / g.count) * 100 : 0;

    const div = document.createElement("div");
    div.className = "kpi";
    div.innerHTML = `
      <div class="small">${label}: ${escapeHtml(k)}</div>
      <div class="v ${g.pl >= 0 ? "good" : "bad"}">${(g.pl >= 0 ? "+" : "") + formatNum(g.pl)}</div>
      <div class="small">Trades: <b>${g.count}</b> • Win rate: <b>${winRate.toFixed(1)}%</b></div>
    `;
    box.appendChild(div);
  }
}

/* ---------- Equity curve ---------- */

function drawEquityCurve(trades) {
  const canvas = $("equityChart");
  const ctx = canvas.getContext("2d");

  const cssW = canvas.clientWidth || 900;
  const cssH = canvas.clientHeight || 240;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, cssW, cssH);

  const asc = [...trades]
    .filter(t => t.date && t.equityAfter !== "" && t.equityAfter != null)
    .sort((a, b) => (a.date > b.date ? 1 : -1));

  if (asc.length < 2) {
    ctx.font = "12px system-ui";
    ctx.fillStyle = "rgba(159,176,208,0.9)";
    ctx.fillText("Add at least 2 trades with Equity After Trade to see the curve.", 12, 20);
    return;
  }

  const values = asc.map(t => Number(t.equityAfter) || 0);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const denom = (maxV - minV) || 1;

  const padL = 42, padR = 12, padT = 12, padB = 26;
  const W = cssW - padL - padR;
  const H = cssH - padT - padB;

  // grid
  ctx.strokeStyle = "rgba(34,48,79,0.9)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (H * i / 4);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + W, y);
    ctx.stroke();
  }

  // labels
  ctx.fillStyle = "rgba(159,176,208,0.9)";
  ctx.font = "12px system-ui";
  ctx.fillText(formatNum(maxV), 10, padT + 10);
  ctx.fillText(formatNum(minV), 10, padT + H);

  // line
  ctx.strokeStyle = "rgba(234,240,255,0.95)";
  ctx.lineWidth = 2;
  ctx.beginPath();

  asc.forEach((t, i) => {
    const x = padL + (W * (i / (asc.length - 1)));
    const y = padT + (H * (1 - ((values[i] - minV) / denom)));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // last dot
  const lastX = padL + W;
  const lastY = padT + (H * (1 - ((values[values.length - 1] - minV) / denom)));
  ctx.fillStyle = "rgba(143,240,181,0.95)";
  ctx.beginPath();
  ctx.arc(lastX, lastY, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(143,240,181,0.95)";
  ctx.fillText(`Last: ${formatNum(values[values.length - 1])}`, padL + 8, padT + H + 18);
}

/* ---------- Main render ---------- */

async function render() {
  const allTrades = await loadTrades();
  rebuildPairFilterOptions(allTrades);

  const filtered = applyFilters(allTrades);
  const trades = filtered.sort((a, b) => (a.date > b.date ? -1 : 1));

  // Table
  const tb = $("tradeBody");
  tb.innerHTML = "";

  let total = 0;
  const wins = [];
  const losses = [];

  for (const t of trades) {
    const pl = Number(t.pl) || 0;
    total += pl;
    if (pl > 0) wins.push(pl);
    if (pl < 0) losses.push(pl);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Date">${t.date || ""}</td>
      <td data-label="Pair">${t.pair ? `<span class="pill">${escapeHtml(t.pair)}</span>` : ""}</td>
      <td data-label="Session">${escapeHtml(t.session || "")}</td>
      <td data-label="Direction">${escapeHtml(t.direction || "")}</td>
      <td data-label="Emotion">${escapeHtml(t.emotion || "")}</td>
      <td data-label="Entry">${formatNum(t.entry)}</td>
      <td data-label="SL">${formatNum(t.sl)}</td>
      <td data-label="TP">${formatNum(t.tp)}</td>
      <td data-label="Lot">${formatNum(t.lot)}</td>
      <td data-label="P/L" class="${pl >= 0 ? "good" : "bad"}">${(pl >= 0 ? "+" : "") + formatNum(pl)}</td>
      <td data-label="Equity After">${formatNum(t.equityAfter)}</td>
      <td data-label="Notes">${t.notes ? escapeHtml(t.notes).slice(0, 60) + (t.notes.length > 60 ? "…" : "") : ""}</td>
      <td data-label="Action"><button class="danger" data-del="${t.id}" disabled>Delete</button></td>
    `;
    tb.appendChild(tr);
  }

  // KPIs
  $("kpiTotal").textContent = (total >= 0 ? "+" : "") + formatNum(total);
  const winRate = trades.length ? (wins.length / trades.length) * 100 : 0;
  $("kpiWinRate").textContent = `${winRate.toFixed(1)}%`;
  $("kpiAvgWin").textContent = wins.length ? "+" + formatNum(avg(wins)) : "0";
  $("kpiAvgLoss").textContent = losses.length ? formatNum(avg(losses)) : "0";

  // Analytics
  renderPeriodBox(trades, getMonthKey, "monthlyBox", "Month");
  renderPeriodBox(trades, getWeekKey, "weeklyBox", "Week");
  renderGroupBox(trades, "session", "sessionBox", "Session");
  renderGroupBox(trades, "emotion", "emotionBox", "Emotion");
  renderGroupBox(trades, "pair", "pairBox", "Pair");
  renderGroupBox(trades, "direction", "directionBox", "Direction");

  // Chart
  drawEquityCurve(trades);

  // Delete
  document.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-del");
      const current = await loadTrades();
      const next = current.filter(t => String(t.id) !== String(id));
      await saveTrades(next);
      await render();
    });
  });
}

/* ---------- Events ---------- */

$("tradeForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const plSigned = getSignedPL();
  const trade = {
    id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()),
    date: $("date").value,
    session: $("session").value,
    emotion: $("emotion").value,
    pair: $("pair").value.trim(),
    direction: $("direction").value,
    lot: Number($("lot").value || 0),
    pl: plSigned,

    equityBefore: Number($("equityBefore").value || 0),
    equityAfter: Number($("equityAfter").value || 0),

    entry: $("entry").value,
    sl: $("sl").value,
    tp: $("tp").value,
    notes: $("notes").value.trim(),

    resultType: $("resultType").value,
    resultAmount: Number($("resultAmount").value || 0),
  };

  const trades = await loadTrades();
  trades.push(trade);
  await saveTrades(trades);

  e.target.reset();
  $("date").valueAsDate = new Date();
  await render();
});

$("clearAll").addEventListener("click", async () => {
  if (confirm("Delete ALL trades? This cannot be undone.")) {
    await saveTrades([]);
    await render();
  }
});

// Export JSON (exports current cloud data)
$("exportBtn").addEventListener("click", async () => {
  const data = JSON.stringify(await loadTrades(), null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "trading-journal-backup.json";
  a.click();

  URL.revokeObjectURL(url);
});

// Import JSON (replaces cloud data)
$("importBtn").addEventListener("click", () => $("fileInput").click());
$("fileInput").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const txt = await file.text();
  try {
    const parsed = JSON.parse(txt);
    if (!Array.isArray(parsed)) throw new Error("Invalid JSON file");
    await saveTrades(parsed);
    await render();
    alert("Imported successfully!");
  } catch (err) {
    alert("Import failed: " + err.message);
  } finally {
    e.target.value = "";
  }
});

// Filters
["filterPair", "filterSession", "filterDirection", "filterFrom", "filterTo"].forEach(id => {
  $(id).addEventListener("change", () => render());
  $(id).addEventListener("input", () => render());
});

$("resetFilters").addEventListener("click", async () => {
  $("filterPair").value = "";
  $("filterSession").value = "";
  $("filterDirection").value = "";
  $("filterFrom").value = "";
  $("filterTo").value = "";
  await render();
});

// Auto equity after
["equityBefore", "resultType", "resultAmount"].forEach(id => {
  $(id).addEventListener("input", autoFillEquityAfter);
  $(id).addEventListener("change", autoFillEquityAfter);
});

// Resize chart
window.addEventListener("resize", () => {
  clearTimeout(window.__eqResizeT);
  window.__eqResizeT = setTimeout(() => render(), 80);
});

/* ---------- Boot ---------- */

function init() {
  $("date").valueAsDate = new Date();
  autoFillEquityAfter();
  render();
}

if (hasCloud()) {
  setStatus("Sync: connected ✅");
  init();
} else {
  setStatus("Sync: waiting for Firebase...");
  window.addEventListener("cloud-ready", async () => {
    setStatus("Sync: connected ✅");
    await render();
  }, { once: true });

  // fallback if cloud never loads (still works locally)
  setTimeout(() => {
    if (!hasCloud()) {
      setStatus("Sync: offline (local only)");
      init();
    }
  }, 1200);

}
