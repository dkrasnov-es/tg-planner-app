// Планировщик — Telegram Mini App поверх tg_planner v1.
// Данные: снапшот из CloudStorage (ключ "snap"), обновляется inline-кнопкой
// «Синхронизировать» от бота (payload в location.hash). Действия копятся в
// буфер (localStorage) и уходят батчем через sendData из reply-кнопки.

const STYLE = `
  :root {
    --bg: var(--tg-theme-bg-color, #f2f2f7);
    --card: var(--tg-theme-section-bg-color, #ffffff);
    --text: var(--tg-theme-text-color, #1c1c1e);
    --hint: var(--tg-theme-hint-color, #8e8e93);
    --btn: var(--tg-theme-button-color, #2481cc);
    --btn-text: var(--tg-theme-button-text-color, #ffffff);
    --red: #d94f30; --green: #34c759;
  }
  * { box-sizing: border-box; margin: 0; -webkit-tap-highlight-color: transparent; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; background: var(--bg);
    color: var(--text); font-size: 16px; line-height: 1.4; padding-bottom: 76px; }
  .hdr { padding: 16px 16px 8px; }
  .hdr h1 { font-size: 23px; font-weight: 800; }
  .hdr .sub { font-size: 13px; color: var(--hint); margin-top: 2px; }
  .stale { color: #c77b00; }
  .sec { font-size: 12.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
    color: var(--hint); margin: 14px 16px 7px; display: flex; justify-content: space-between; }
  .sec .red { color: var(--red); }
  .card { background: var(--card); border-radius: 13px; margin: 0 12px 8px; padding: 12px 13px; }
  .task { display: flex; align-items: flex-start; gap: 10px; }
  .cb { width: 22px; height: 22px; border: 2px solid #c7c7cc; border-radius: 7px; flex-shrink: 0;
    margin-top: 1px; }
  .cb.on { background: var(--green); border-color: var(--green); position: relative; }
  .cb.on::after { content: "✓"; color: #fff; position: absolute; top: -2px; left: 3px;
    font-size: 15px; font-weight: 800; }
  .t-body { flex: 1; min-width: 0; }
  .t-name { font-size: 15px; font-weight: 500; }
  .t-name.done { text-decoration: line-through; color: var(--hint); }
  .t-meta { font-size: 12px; color: var(--hint); margin-top: 3px; display: flex; gap: 7px;
    flex-wrap: wrap; align-items: center; }
  .chip { font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 5px; }
  .chip.p1 { background: #ffe5e0; color: var(--red); }
  .chip.proj { background: #e8f0fe; color: #3169c6; }
  .over { color: var(--red); font-weight: 600; }
  .moved { color: var(--btn); font-weight: 600; }
  .t-acts { flex-shrink: 0; display: flex; gap: 2px; }
  .defer { flex-shrink: 0; border: none; background: none; color: var(--hint); font-size: 19px;
    padding: 2px 4px; cursor: pointer; }
  .defer-row { display: flex; gap: 6px; margin-top: 8px; }
  .defer-opt { flex: 1; border: none; border-radius: 9px; background: var(--bg); color: var(--text);
    font-size: 12.5px; font-weight: 600; padding: 8px 2px; cursor: pointer; }
  .stats { display: flex; gap: 8px; margin: 4px 12px 6px; }
  .stat { flex: 1; background: var(--card); border-radius: 13px; padding: 11px 6px; text-align: center; cursor: pointer; }
  .stat:active { opacity: .6; }
  .stat .n { font-size: 23px; font-weight: 800; }
  .stat .l { font-size: 10.5px; color: var(--hint); margin-top: 1px; }
  .scope-row { display: flex; gap: 6px; overflow-x: auto; padding: 2px 12px 8px; -webkit-overflow-scrolling: touch; }
  .scope-row::-webkit-scrollbar { display: none; }
  .scope-chip { flex: 0 0 auto; background: var(--card); color: var(--hint); border: none;
    border-radius: 999px; font-size: 12.5px; font-weight: 600; padding: 7px 13px; cursor: pointer; white-space: nowrap; }
  .scope-chip.on { background: var(--btn); color: #fff; }
  .n.red { color: var(--red); } .n.blue { color: var(--btn); } .n.green { color: var(--green); }
  .focus { background: linear-gradient(135deg, var(--btn), #1a5fa8); border-radius: 15px;
    margin: 0 12px 8px; padding: 13px 15px; color: #fff; }
  .focus .fl { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em;
    opacity: .75; margin-bottom: 3px; }
  .focus .fn { font-size: 15.5px; font-weight: 700; }
  .focus .fp { font-size: 12px; opacity: .8; margin-top: 4px; }
  .focus.mini { background: var(--card); color: var(--text); }
  .focus.mini .fl, .focus.mini .fp { color: var(--hint); opacity: 1; }
  .focus.done-card { opacity: .55; }
  .qa-row { display: flex; gap: 8px; margin: 4px 12px 8px; }
  .qa { flex: 1; background: var(--card); border: none; border-radius: 12px; padding: 11px 4px;
    text-align: center; font-size: 12px; font-weight: 600; color: var(--btn); cursor: pointer; }
  .qa .ic { display: block; font-size: 19px; margin-bottom: 3px; }
  .ritual { display: flex; align-items: center; gap: 11px; }
  .rit-st { font-size: 17px; }
  .tabbar { position: fixed; bottom: 0; left: 0; right: 0; background: var(--card);
    border-top: .5px solid #d1d1d6; display: flex; padding: 7px 0 20px; z-index: 5; }
  .tab { flex: 1; text-align: center; font-size: 11px; color: var(--hint); cursor: pointer; }
  .tab.on { color: var(--btn); }
  .tab .ic { font-size: 21px; display: block; margin-bottom: 1px; }
  .empty { text-align: center; color: var(--hint); padding: 40px 30px; font-size: 15px; }
  .form-label { font-size: 12.5px; font-weight: 700; color: var(--hint); margin: 14px 16px 6px;
    text-transform: uppercase; letter-spacing: .05em; }
  input[type=text], input[type=date], select { width: calc(100% - 24px); margin: 0 12px; padding: 12px 14px;
    font-size: 16px; font-family: inherit; border: 1.5px solid transparent; border-radius: 12px;
    background: var(--card); color: var(--text); outline: none; }
  input[type=text]:focus, input[type=date]:focus { border-color: var(--btn); }
  input[type=date] { -webkit-appearance: none; appearance: none; }
  .date-custom { margin: 7px 12px 0; }
  .date-custom.on input[type=date] { border-color: var(--btn); }
  .date-row { display: flex; gap: 7px; margin: 8px 12px 0; }
  .date-opt { flex: 1; border: none; border-radius: 10px; background: var(--card); color: var(--text);
    font-size: 13px; font-weight: 600; padding: 10px 2px; cursor: pointer; }
  .date-opt.on { background: var(--btn); color: var(--btn-text); }
  .big-title { font-size: 22px; font-weight: 800; margin: 10px 16px 4px; }
  .center-box { padding: 60px 28px; text-align: center; }
  .center-box h2 { font-size: 22px; margin-bottom: 10px; }
  .center-box p { color: var(--hint); font-size: 15px; }
  .prim-btn { display: block; width: calc(100% - 32px); margin: 22px 16px 0; border: none;
    border-radius: 13px; background: var(--btn); color: var(--btn-text); font-size: 16px;
    font-weight: 700; padding: 14px; cursor: pointer; }
`;
const styleEl = document.createElement("style");
styleEl.textContent = STYLE;
document.head.appendChild(styleEl);

const tg = window.Telegram.WebApp;
tg.ready(); tg.expand();
const app = document.getElementById("app");
const mb = tg.MainButton;
const CS = tg.CloudStorage;

function esc(s) {
  return (s == null ? "" : String(s)).replace(/[&<>"]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function csGet(key) {
  return new Promise(res => { if (!CS) return res(null); CS.getItem(key, (e, v) => res(e ? null : v)); });
}
function csSet(key, val) {
  return new Promise(res => { if (!CS) return res(false); CS.setItem(key, val, (e, ok) => res(!e && ok)); });
}
function csRemove(key) {
  return new Promise(res => { if (!CS) return res(false); CS.removeItem(key, (e, ok) => res(!e && ok)); });
}
function b64urlToBytes(s) {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
async function gunzipB64(b64) {
  const stream = new Blob([b64urlToBytes(b64)]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}
async function gzipB64(str) {
  const cs = new CompressionStream("gzip");
  const stream = new Blob([new TextEncoder().encode(str)]).stream().pipeThrough(cs);
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
// Снапшот может не влезать в лимит значения CS (~4096) — жмём с префиксом GZ:
async function csSetBig(key, obj) {
  let raw = JSON.stringify(obj);
  if (new TextEncoder().encode(raw).length > 3900) {
    if (typeof CompressionStream === "undefined") return false;
    raw = "GZ:" + await gzipB64(raw);
    if (raw.length > 4096) return false;
  }
  return csSet(key, raw);
}
async function csGetBig(key) {
  let raw = await csGet(key);
  if (!raw) return null;
  try {
    if (raw.startsWith("GZ:")) raw = await gunzipB64(raw.slice(3));
    return JSON.parse(raw);
  } catch (e) { return null; }
}

// ── Состояние ───────────────────────────────────────────────────────────────
let snap = null;          // снапшот данных от бота
let tab = "dash";         // dash | list
let scope = "today";      // today | tomorrow | week | nextweek | overdue | doneweek
let pending = loadPending();  // буфер несохранённых действий
let openDefer = null;     // id задачи с раскрытым выбором переноса

const PENDING_KEY = "planner_pending_v1";
function emptyPending() {
  return { done: [], postpone: {}, add: [], edit: {} };
}
function loadPending() {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING_KEY) || "null") || {};
    return Object.assign(emptyPending(), p);   // гарантируем все ключи (миграция старого буфера)
  } catch (e) { return emptyPending(); }
}
function savePending() {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(pending)); } catch (e) {}
  updateMainButton();
}
function clearPending() {
  pending = emptyPending();
  try { localStorage.removeItem(PENDING_KEY); } catch (e) {}
  updateMainButton();
}
function pendingCount() {
  return pending.done.length + Object.keys(pending.postpone).length +
    pending.add.length + Object.keys(pending.edit).length;
}

// ── Даты ────────────────────────────────────────────────────────────────────
function isoAddDays(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
// Понедельник календарной недели, содержащей iso (+ offsetWeeks недель).
function weekMonday(iso, offsetWeeks) {
  const d = new Date(iso + "T00:00:00");
  const dow = (d.getDay() + 6) % 7;   // 0=пн … 6=вс
  return isoAddDays(iso, -dow + (offsetWeeks || 0) * 7);
}
// [понедельник, воскресенье] недели (offsetWeeks: 0=текущая, 1=следующая).
function weekBounds(iso, offsetWeeks) {
  const mon = weekMonday(iso, offsetWeeks);
  return [mon, isoAddDays(mon, 6)];
}
const MONTHS_RU = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const DOW_RU = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
function fmtDay(iso) {
  if (!iso) return "без даты";
  const d = new Date(iso + "T00:00:00");
  return `${DOW_RU[d.getDay()]}, ${d.getDate()} ${MONTHS_RU[d.getMonth()]}`;
}
function daysOverdue(iso) {
  const ms = new Date(snap.today + "T00:00:00") - new Date(iso + "T00:00:00");
  return Math.round(ms / 86400000);
}

// ── Производные данные (снапшот + буфер поверх) ─────────────────────────────
function effTasks() {
  const done = new Set(pending.done);
  const out = snap.tasks.map(t => {
    const e = pending.edit[t.id] || {};
    return {
      ...t,
      n: "n" in e ? e.n : t.n,
      p: "p" in e ? e.p : t.p,
      // быстрый перенос (⇥) имеет приоритет над сроком из формы правки
      d: pending.postpone[t.id] || ("d" in e ? e.d : t.d),
      isDone: done.has(t.id),
      isEdited: !!pending.edit[t.id]
    };
  });
  pending.add.forEach((a, i) => out.push({
    id: "new" + i, n: a.n, p: a.p, pr: a.pr || 2, d: a.d, isDone: false, isNew: true
  }));
  return out;
}
function grouped() {
  const t = snap.today;
  const week = isoAddDays(t, 7);
  const g = { overdue: [], today: [], upcoming: [] };
  effTasks().forEach(x => {
    if (!x.d) return;                    // задачи без даты в списке дня не показываем
    if (x.d < t) g.overdue.push(x);
    else if (x.d === t) g.today.push(x);
    else if (x.d <= week) g.upcoming.push(x);
  });
  const byDue = (a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : (a.pr - b.pr));
  g.overdue.sort(byDue); g.today.sort((a, b) => a.pr - b.pr); g.upcoming.sort(byDue);
  return g;
}
function projName(pid) {
  return (snap.projects && snap.projects[pid]) || null;
}

// ── Отрисовка ───────────────────────────────────────────────────────────────
function render() {
  if (tab === "dash") renderDash();
  else renderList();
  renderTabbar();
  updateMainButton();
}

function header(title) {
  const stale = snap.ts ? staleText(snap.ts) : "";
  return `<div class="hdr"><h1>${title}</h1>
    <div class="sub">${esc(fmtDay(snap.today))}${stale}</div></div>`;
}
function staleText(ts) {
  const ageH = (Date.now() - new Date(ts).getTime()) / 3600000;
  const t = new Date(ts);
  const p = n => String(n).padStart(2, "0");
  const label = `данные: ${p(t.getHours())}:${p(t.getMinutes())}`;
  return ageH > 18 ? ` · <span class="stale">${label} — запросите синк у бота</span>` : ` · ${label}`;
}

function taskCard(x, opts) {
  const withDefer = opts && opts.defer;
  const meta = [];
  if (x.pr === 1) meta.push(`<span class="chip p1">P1</span>`);
  const pn = projName(x.p);
  if (pn) meta.push(`<span class="chip proj">${esc(pn.slice(0, 22))}</span>`);
  if (x.isNew) meta.push(`<span class="moved">новая</span>`);
  if (x.isEdited) meta.push(`<span class="moved">изменена</span>`);
  if (pending.postpone[x.id]) meta.push(`<span class="moved">→ ${esc(fmtDay(x.d))}</span>`);
  else if (x.d && x.d < snap.today) meta.push(`<span class="over">${daysOverdue(x.d)} дн.</span>`);
  else if (x.d && x.d > snap.today) meta.push(`<span>${esc(fmtDay(x.d))}</span>`);
  let deferHtml = "";
  if (openDefer === x.id) {
    deferHtml = `<div class="defer-row">
      <button class="defer-opt" data-defer="${x.id}" data-to="${snap.today}">Сегодня</button>
      <button class="defer-opt" data-defer="${x.id}" data-to="${isoAddDays(snap.today, 1)}">Завтра</button>
      <button class="defer-opt" data-defer="${x.id}" data-to="${isoAddDays(snap.today, 7)}">+7 дней</button>
      <button class="defer-opt" data-defer="${x.id}" data-to="">✕</button>
    </div>`;
  }
  return `<div class="card">
    <div class="task">
      ${x.isNew ? `<div class="cb on" style="background:var(--btn);border-color:var(--btn)"></div>`
        : `<div class="cb${x.isDone ? " on" : ""}" data-toggle="${x.id}"></div>`}
      <div class="t-body">
        <div class="t-name${x.isDone ? " done" : ""}">${esc(x.n)}</div>
        <div class="t-meta">${meta.join("")}</div>
      </div>
      ${!x.isNew && !x.isDone ? `<div class="t-acts">
        <button class="defer" data-edit="${x.id}">✎</button>
        ${withDefer ? `<button class="defer" data-open-defer="${x.id}">⇥</button>` : ""}
      </div>` : ""}
    </div>${deferHtml}</div>`;
}

function renderDash() {
  const g = grouped();
  const doneToday = g.today.filter(x => x.isDone).length + snap.tasks.filter(t => t.doneToday).length;
  const focusIds = snap.focus || [];
  const all = effTasks();
  const focusTasks = focusIds.map(id => all.find(x => x.id === id)).filter(Boolean);
  let html = header("Планировщик");
  html += `<div class="stats">
    <div class="stat" data-scope="today"><div class="n blue">${g.today.filter(x => !x.isDone).length}</div><div class="l">сегодня</div></div>
    <div class="stat" data-scope="overdue"><div class="n red">${g.overdue.filter(x => !x.isDone).length}</div><div class="l">просрочено</div></div>
    <div class="stat" data-scope="doneweek"><div class="n green">${(snap.stats && snap.stats.done_week) || 0}</div><div class="l">за неделю ✓</div></div>
  </div>`;
  if (focusTasks.length) {
    html += `<div class="sec"><span>Фокус дня</span></div>`;
    focusTasks.forEach((x, i) => {
      const pn = projName(x.p);
      const sub = [pn, x.pr === 1 ? "P1" : null,
        x.d && x.d < snap.today ? `просрочена ${daysOverdue(x.d)} дн.` : null].filter(Boolean).join(" · ");
      html += `<div class="focus${i ? " mini" : ""}${x.isDone ? " done-card" : ""}" data-focus="${x.id}">
        <div class="fl">${i === 0 ? "Главная задача" : (i === 1 ? "Вторая" : "Третья")}${x.isDone ? " · сделана ✓" : ""}</div>
        <div class="fn">${esc(x.n)}</div>
        <div class="fp">${esc(sub)}</div>
      </div>`;
    });
  }
  html += `<div class="sec"><span>Быстрые действия</span></div>
    <div class="qa-row">
      <button class="qa" id="qa-add"><span class="ic">＋</span>Задача</button>
      <button class="qa" id="qa-overdue"><span class="ic">📥</span>Просрочка (${g.overdue.filter(x => !x.isDone).length})</button>
    </div>`;
  const r = snap.rituals || {};
  html += `<div class="sec"><span>Ритуалы</span></div>
    <div class="card ritual"><div>🌅</div>
      <div class="t-body"><div class="t-name">Утренний план</div>
        <div class="t-meta">${r.morning ? "отправлен ботом" : "ещё не отправлялся"}</div></div>
      <div class="rit-st">${r.morning ? "✓" : "·"}</div></div>
    <div class="card ritual"><div>🌙</div>
      <div class="t-body"><div class="t-name">Вечерний обзор</div>
        <div class="t-meta">${r.evening ? "отправлен ботом" : "будет в 16:00 UTC"}</div></div>
      <div class="rit-st">${r.evening ? "✓" : "·"}</div></div>`;
  app.innerHTML = html;
  document.getElementById("qa-add").onclick = () => renderAddForm();
  document.getElementById("qa-overdue").onclick = () => { tab = "list"; scope = "overdue"; render(); window.scrollTo(0, 0); };
  app.querySelectorAll(".stat[data-scope]").forEach(el => {
    el.onclick = () => { tab = "list"; scope = el.dataset.scope; render(); window.scrollTo(0, 0); };
  });
  app.querySelectorAll("[data-focus]").forEach(el => {
    el.onclick = () => toggleDone(el.dataset.focus);
  });
}

const SCOPES = [
  ["today", "Сегодня"], ["tomorrow", "Завтра"],
  ["week", "Эта неделя"], ["nextweek", "След. неделя"],
  ["overdue", "Просрочка"], ["doneweek", "Готово ✓"],
];
function scopeTitle() {
  return ({ today: "Сегодня", tomorrow: "Завтра", week: "Эта неделя",
    nextweek: "Следующая неделя", overdue: "Просроченные", doneweek: "Сделано за неделю" })[scope] || "Задачи";
}
function scopeChipsHtml() {
  return `<div class="scope-row">` + SCOPES.map(([s, l]) =>
    `<button class="scope-chip${scope === s ? " on" : ""}" data-scope="${s}">${l}</button>`).join("") + `</div>`;
}
// Активные задачи в диапазоне дат [from, to] включительно, сгруппированные по дню.
function rangeGroupedHtml(from, to) {
  const items = effTasks().filter(x => x.d && x.d >= from && x.d <= to && !x.isDone)
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.pr - b.pr));
  if (!items.length) return `<div class="empty">Задач нет 🎉</div>`;
  let html = "", curDay = null;
  items.forEach(x => {
    if (x.d !== curDay) { curDay = x.d; html += `<div class="sec"><span>${esc(fmtDay(x.d))}</span></div>`; }
    html += taskCard(x, { defer: true });
  });
  return html;
}
function doneCard(t) {
  const pn = projName(t.p);
  const meta = [pn ? `<span class="chip proj">${esc(pn.slice(0, 22))}</span>` : "",
    (t.cd || t.d) ? `<span>${esc(fmtDay(t.cd || t.d))}</span>` : ""].filter(Boolean).join("");
  return `<div class="card"><div class="task">
    <div class="cb on" style="background:var(--btn);border-color:var(--btn)"></div>
    <div class="t-body"><div class="t-name done">${esc(t.n)}</div><div class="t-meta">${meta}</div></div>
  </div></div>`;
}
function renderList() {
  let html = header(scopeTitle());
  html += scopeChipsHtml();
  if (scope === "today") {
    const g = grouped();
    if (g.overdue.length) {
      html += `<div class="sec"><span class="red">Просроченные</span><span>${g.overdue.length}</span></div>`;
      g.overdue.forEach(x => { html += taskCard(x, { defer: true }); });
    }
    html += `<div class="sec"><span>Сегодня</span><span>${g.today.length}</span></div>`;
    if (g.today.length) g.today.forEach(x => { html += taskCard(x, { defer: true }); });
    else html += `<div class="empty">На сегодня задач нет 🎉</div>`;
    if (g.upcoming.length) {
      html += `<div class="sec"><span>Ближайшие 7 дней</span><span>${g.upcoming.length}</span></div>`;
      g.upcoming.forEach(x => { html += taskCard(x, {}); });
    }
  } else if (scope === "tomorrow") {
    const tm = isoAddDays(snap.today, 1);
    html += rangeGroupedHtml(tm, tm);
  } else if (scope === "week") {
    const [mon, sun] = weekBounds(snap.today, 0);
    html += rangeGroupedHtml(mon, sun);
  } else if (scope === "nextweek") {
    const [mon, sun] = weekBounds(snap.today, 1);
    html += rangeGroupedHtml(mon, sun);
  } else if (scope === "overdue") {
    const od = effTasks().filter(x => x.d && x.d < snap.today && !x.isDone)
      .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.pr - b.pr));
    if (!od.length) html += `<div class="empty">Просроченных нет 🎉</div>`;
    else od.forEach(x => { html += taskCard(x, { defer: true }); });
  } else if (scope === "doneweek") {
    const done = (snap.done_week_tasks || []).slice()
      .sort((a, b) => ((a.cd || a.d || "") < (b.cd || b.d || "") ? 1 : -1));
    if (!done.length) html += `<div class="empty">За неделю ничего не выполнено</div>`;
    else done.forEach(t => { html += doneCard(t); });
  }
  app.innerHTML = html;
  app.querySelectorAll(".scope-chip[data-scope]").forEach(el => {
    el.onclick = () => { scope = el.dataset.scope; openDefer = null; render(); window.scrollTo(0, 0); };
  });
  bindTaskHandlers();
}

function bindTaskHandlers() {
  app.querySelectorAll("[data-toggle]").forEach(el => {
    el.onclick = () => toggleDone(el.dataset.toggle);
  });
  app.querySelectorAll("[data-open-defer]").forEach(el => {
    el.onclick = () => {
      const id = Number(el.dataset.openDefer);
      openDefer = openDefer === id ? null : id;
      render();
    };
  });
  app.querySelectorAll("[data-edit]").forEach(el => {
    el.onclick = () => renderEditForm(Number(el.dataset.edit));
  });
  app.querySelectorAll("[data-defer]").forEach(el => {
    el.onclick = () => {
      const id = Number(el.dataset.defer);
      const to = el.dataset.to;
      if (to) pending.postpone[id] = to;
      else delete pending.postpone[id];
      openDefer = null;
      savePending();
      tg.HapticFeedback.impactOccurred("light");
      render();
    };
  });
}

function toggleDone(id) {
  id = Number(id);
  const i = pending.done.indexOf(id);
  if (i >= 0) pending.done.splice(i, 1);
  else pending.done.push(id);
  savePending();
  tg.HapticFeedback.impactOccurred("light");
  render();
}

// ── Секция выбора срока (пресеты + произвольная дата) ─────────────────────────
function datePresets() {
  return [["Сегодня", snap.today], ["Завтра", isoAddDays(snap.today, 1)],
    ["+7 дней", isoAddDays(snap.today, 7)], ["Без даты", ""]];
}
function dateSectionHtml(sel) {
  const presets = datePresets();
  const isPreset = presets.some(([, v]) => (v || null) === sel);
  return `<div class="date-row">
      ${presets.map(([lbl, v]) =>
        `<button class="date-opt${(v || null) === sel && isPreset ? " on" : ""}" data-due="${v}">${lbl}</button>`).join("")}
    </div>
    <div class="date-custom${sel && !isPreset ? " on" : ""}">
      <input type="date" id="date-custom" value="${sel && !isPreset ? sel : ""}" placeholder="Другая дата">
    </div>`;
}
// setDue(iso|null) вызывается при выборе пресета или произвольной даты
function wireDateSection(setDue) {
  const custom = app.querySelector("#date-custom");
  const box = app.querySelector(".date-custom");
  app.querySelectorAll(".date-opt").forEach(b => {
    b.onclick = () => {
      setDue(b.dataset.due || null);
      app.querySelectorAll(".date-opt").forEach(x => x.classList.toggle("on", x === b));
      if (custom) custom.value = "";
      if (box) box.classList.remove("on");
    };
  });
  if (custom) custom.onchange = () => {
    if (!custom.value) return;
    setDue(custom.value);
    app.querySelectorAll(".date-opt").forEach(x => x.classList.remove("on"));
    if (box) box.classList.add("on");
  };
}

// ── Добавление задачи ───────────────────────────────────────────────────────
let addDue = null;
function renderAddForm() {
  addDue = snap.today;
  tg.BackButton.show();
  app.innerHTML = `<div class="big-title">Новая задача</div>
    <div class="form-label">Название</div>
    <input type="text" id="add-name" placeholder="Что нужно сделать?">
    <div class="form-label">Проект</div>
    <select id="add-proj">${projectOptions(null)}</select>
    <div class="form-label">Срок</div>
    ${dateSectionHtml(addDue)}
    <button class="prim-btn" id="add-go">Добавить в буфер</button>`;
  mb.hide();
  wireDateSection(v => { addDue = v; });
  document.getElementById("add-go").onclick = () => {
    const name = document.getElementById("add-name").value.trim();
    if (!name) { tg.HapticFeedback.notificationOccurred("error"); return; }
    const pid = document.getElementById("add-proj").value;
    pending.add.push({ n: name, p: pid ? Number(pid) : null, d: addDue });
    savePending();
    tg.HapticFeedback.impactOccurred("light");
    closeSub();
  };
  tg.BackButton.onClick(closeSub);
}
function closeSub() {
  tg.BackButton.hide();
  render();
}

// Опции <select> проектов; текущий проект задачи добавляется, даже если он
// не «In Progress» (в снапшоте таких нет) — иначе правка случайно его сбросит.
function projectOptions(selectedPid) {
  const projs = Object.entries(snap.projects || {});
  const has = selectedPid != null && projs.some(([id]) => Number(id) === selectedPid);
  let out = `<option value=""${selectedPid == null ? " selected" : ""}>Без проекта</option>`;
  if (selectedPid != null && !has) {
    out += `<option value="${selectedPid}" selected>${esc(projName(selectedPid) || "Проект #" + selectedPid)}</option>`;
  }
  out += projs.map(([id, name]) =>
    `<option value="${id}"${Number(id) === selectedPid ? " selected" : ""}>${esc(name)}</option>`).join("");
  return out;
}

// ── Редактирование задачи ─────────────────────────────────────────────────────
let editDue = null;
function renderEditForm(id) {
  const orig = snap.tasks.find(t => t.id === id);
  if (!orig) { render(); return; }
  const cur = Object.assign({}, orig, pending.edit[id] || {});  // эффективные значения
  editDue = cur.d || null;
  tg.BackButton.show();
  mb.hide();
  app.innerHTML = `<div class="big-title">Редактировать задачу</div>
    <div class="form-label">Название</div>
    <input type="text" id="ed-name" value="${esc(cur.n)}">
    <div class="form-label">Проект</div>
    <select id="ed-proj">${projectOptions(cur.p == null ? null : Number(cur.p))}</select>
    <div class="form-label">Срок</div>
    ${dateSectionHtml(editDue)}
    <button class="prim-btn" id="ed-go">Сохранить в буфер</button>`;
  wireDateSection(v => { editDue = v; });
  document.getElementById("ed-go").onclick = () => {
    const name = document.getElementById("ed-name").value.trim();
    if (!name) { tg.HapticFeedback.notificationOccurred("error"); return; }
    const selP = document.getElementById("ed-proj").value;
    const newP = selP ? Number(selP) : null;
    const changes = {};
    if (name !== orig.n) changes.n = name;
    if (newP !== (orig.p == null ? null : Number(orig.p))) changes.p = newP;
    if ((editDue || null) !== (orig.d || null)) changes.d = editDue || null;
    if (Object.keys(changes).length) pending.edit[id] = changes;
    else delete pending.edit[id];
    savePending();
    tg.HapticFeedback.impactOccurred("light");
    closeSub();
  };
  tg.BackButton.onClick(closeSub);
}

function renderTabbar() {
  let bar = document.getElementById("tabbar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "tabbar";
    bar.className = "tabbar";
    document.body.appendChild(bar);
  }
  bar.innerHTML = `
    <div class="tab${tab === "dash" ? " on" : ""}" data-tab="dash"><span class="ic">🏠</span>Дашборд</div>
    <div class="tab${tab === "list" ? " on" : ""}" data-tab="list"><span class="ic">📋</span>Задачи</div>`;
  bar.querySelectorAll(".tab").forEach(el => {
    el.onclick = () => { tab = el.dataset.tab; openDefer = null; render(); window.scrollTo(0, 0); };
  });
}

// ── Сохранение батча ────────────────────────────────────────────────────────
function updateMainButton() {
  const n = pendingCount();
  if (!n || !snap) { mb.hide(); return; }
  mb.setText(`Сохранить изменения (${n})`);
  mb.show(); mb.enable();
}
mb.onClick(async () => {
  if (!pendingCount()) return;
  // оптимистично применяем буфер к локальному снапшоту — чтобы после
  // переоткрытия приложение показывало актуальное без синка
  const doneSet = new Set(pending.done);
  snap.tasks = snap.tasks.filter(t => !doneSet.has(t.id));
  snap.tasks.forEach(t => {
    const e = pending.edit[t.id];
    if (e) {
      if ("n" in e) t.n = e.n;
      if ("p" in e) t.p = e.p;
      if ("d" in e) t.d = e.d;
    }
    if (pending.postpone[t.id]) t.d = pending.postpone[t.id];
  });
  if (snap.stats) snap.stats.done_week = (snap.stats.done_week || 0) + pending.done.length;
  await csSetBig("snap", snap);
  const payload = JSON.stringify({
    v: 1, done: pending.done, postpone: pending.postpone, add: pending.add, edit: pending.edit
  });
  clearPending();
  tg.HapticFeedback.notificationOccurred("success");
  tg.sendData(payload);   // закроет приложение; бот применит и пришлёт свежий синк
});

// ── Синк-режим (данные от бота в URL) ───────────────────────────────────────
// ?sync=<b64url gzip json>  или фрагменты  ?syncf=<t>:<i>:<n>:<кусок>
// (query-параметры, не hash — проверенный в Telegram путь; hash поддержан для совместимости)
function syncParams() {
  const qs = new URLSearchParams(window.location.search);
  // k=1 — открыто из reply-кнопки «Планировщик» (sendData работает) → сразу дашборд
  if (qs.get("sync")) return { whole: qs.get("sync"), k: qs.get("k") === "1" };
  if (qs.get("syncf")) {
    const m = qs.get("syncf").match(/^([^:]+):(\d+):(\d+):(.+)$/);
    if (m) return { t: m[1], i: Number(m[2]), n: Number(m[3]), chunk: m[4] };
  }
  const h = window.location.hash || "";
  const m1 = h.match(/#sync=(.+)/);
  if (m1) return { whole: m1[1] };
  const m2 = h.match(/#syncf=([^:]+):(\d+):(\d+):(.+)/);
  if (m2) return { t: m2[1], i: Number(m2[2]), n: Number(m2[3]), chunk: m2[4] };
  return null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function handleSync() {
  const sp = syncParams();
  if (!sp) return false;
  try {
    if (sp.whole) {
      snap = JSON.parse(await gunzipB64(sp.whole));
      await csSetBig("snap", snap);   // кэшируем; даже при отказе CS покажем из памяти
      // открыто из reply-кнопки — данные уже свежие, показываем дашборд сразу
      if (sp.k) {
        history.replaceState(null, "", location.pathname);
        render();
        return true;
      }
      renderCenter("Данные обновлены ✓",
        "Снимок задач синхронизирован. Откройте планировщик кнопкой «📱 Планировщик» на клавиатуре бота.", true);
      return true;
    }
    const { t, i, n, chunk } = sp;
    const wrote = await csSet("sf" + t + "_" + i, chunk);
    if (!wrote) {
      renderCenter("Не удалось сохранить кусок", `CloudStorage отклонил запись (кусок ${i + 1}/${n}). Запросите новую кнопку: /app`);
      return true;
    }
    // CloudStorage серверный — записи из других webview могут доезжать с лагом; ретраим чтение
    let parts = null, missing = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      parts = []; missing = [];
      for (let k = 0; k < n; k++) {
        const p = await csGet("sf" + t + "_" + k);
        if (p) parts.push(p); else missing.push(k + 1);
      }
      if (!missing.length) break;
      await sleep(600);
    }
    if (missing.length) {
      renderCenter(`Кусок ${i + 1} из ${n} получен`,
        `Ещё не получены: ${missing.join(", ")}. Нажмите оставшиеся кнопки синхронизации в чате (порядок не важен).`);
      return true;
    }
    snap = JSON.parse(await gunzipB64(parts.join("")));
    if (!(await csSetBig("snap", snap))) {
      renderCenter("Не удалось сохранить", "Куски собраны, но CloudStorage отклонил запись снимка. Запросите новую кнопку: /app");
      return true;
    }
    for (let k = 0; k < n; k++) await csRemove("sf" + t + "_" + k);
    renderCenter("Данные обновлены ✓",
      "Снимок задач синхронизирован. Откройте планировщик кнопкой «📱 Планировщик» на клавиатуре бота.", true);
  } catch (e) {
    renderCenter("Не удалось синхронизировать",
      `Ошибка: ${esc(String(e && e.message || e)).slice(0, 120)}. Запросите новую кнопку у бота: /app`);
  }
  return true;
}
function renderCenter(title, text, withOpen) {
  mb.hide(); tg.BackButton.hide();
  app.innerHTML = `<div class="center-box"><h2>${title}</h2><p>${text}</p>
    ${withOpen ? `<button class="prim-btn" id="c-open">Показать сейчас</button>` : ""}</div>`;
  const b = document.getElementById("c-open");
  if (b) b.onclick = () => { history.replaceState(null, "", location.pathname); render(); };
}

// ── Старт ───────────────────────────────────────────────────────────────────
async function init() {
  if (await handleSync()) return;
  snap = await csGetBig("snap");
  if (!snap) {
    renderCenter("Нет данных",
      "Сначала синхронизируйте: отправьте боту команду /app и нажмите кнопку «Синхронизировать».");
    return;
  }
  render();
}
init();
