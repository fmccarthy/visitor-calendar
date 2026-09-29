// ---- Config wiring ----
document.getElementById("group-name").textContent = CONFIG.GROUP_NAME || "Visitor Calendar";
if (CONFIG.SHEET_EDIT_URL) {
  const link = document.getElementById("add-visitor-link");
  link.href = CONFIG.SHEET_EDIT_URL;
  link.hidden = false;
}

// ---- State ----
let visitsByDate = new Map(); // "YYYY-MM-DD" -> [{name, isTalk, talkTitle, talkTime, notes}]
let allVisits = []; // flat list, for upcoming panels
const today = new Date();
let viewYear = today.getFullYear();
let viewMonth = today.getMonth(); // 0-indexed

// ---- CSV fetching & parsing ----
async function loadSheet() {
  const statusEl = document.getElementById("sync-status");
  if (!CONFIG.SHEET_ID || CONFIG.SHEET_ID.includes("PUT_YOUR")) {
    statusEl.textContent = "Not configured yet — set SHEET_ID in config.js";
    return;
  }
  statusEl.textContent = "Syncing…";
  const sheetParam = CONFIG.SHEET_NAME ? `&sheet=${encodeURIComponent(CONFIG.SHEET_NAME)}` : "";
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:csv${sheetParam}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const rows = parseCSV(text);
    buildVisits(rows);
    render();
    statusEl.textContent = `Last synced ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Couldn't load the sheet. Check it's shared as 'Anyone with the link can view/edit'.";
  }
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ""; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1)
    .filter((r) => r.some((cell) => cell.trim() !== ""))
    .map((r) => {
      const obj = {};
      header.forEach((h, idx) => { obj[h] = (r[idx] || "").trim(); });
      return obj;
    });
}

function parseSheetDate(str) {
  if (!str) return null;
  str = str.trim();
  if (!str) return null;
  // YYYY-MM-DD
  let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  // M/D/YYYY or MM/DD/YYYY
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(+m[3], +m[1] - 1, +m[2]);
  const fallback = new Date(str);
  return isNaN(fallback) ? null : fallback;
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildVisits(rows) {
  visitsByDate = new Map();
  allVisits = [];

  for (const r of rows) {
    const name = r["name"];
    if (!name) continue;
    const start = parseSheetDate(r["start date"]);
    if (!start) continue;
    const end = parseSheetDate(r["end date"]) || start;
    const talkTitle = r["talk title"] || "";
    const talkDate = parseSheetDate(r["talk date"]) || (talkTitle ? start : null);
    const talkTime = r["talk time"] || "";
    const notes = r["notes"] || "";

    const visit = { name, start, end, talkTitle, talkDate, talkTime, notes };
    allVisits.push(visit);

    let d = new Date(start);
    let guard = 0;
    while (d <= end && guard < 400) {
      const key = dateKey(d);
      const isTalk = talkDate && dateKey(talkDate) === key && talkTitle;
      if (!visitsByDate.has(key)) visitsByDate.set(key, []);
      visitsByDate.get(key).push({ name, isTalk: !!isTalk, talkTitle, talkTime, notes });
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      guard++;
    }
  }
}

// ---- Rendering ----
function render() {
  renderMonthLabel();
  renderGrid();
  renderUpcoming();
}

function renderMonthLabel() {
  const label = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  document.getElementById("month-label").textContent = label;
}

function hueForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  return hash;
}

function renderGrid() {
  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startOffset = firstOfMonth.getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const cells = [];
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, outside: true, year: viewYear, month: viewMonth - 1 });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, outside: false, year: viewYear, month: viewMonth });
  }
  while (cells.length % 7 !== 0) {
    const nextDay = cells.length - (startOffset + daysInMonth) + 1;
    cells.push({ day: nextDay, outside: true, year: viewYear, month: viewMonth + 1 });
  }

  const todayKey = dateKey(today);

  for (const cell of cells) {
    const realDate = new Date(cell.year, cell.month, cell.day);
    const key = dateKey(realDate);
    const entries = visitsByDate.get(key) || [];

    const el = document.createElement("div");
    el.className = "day-cell" + (cell.outside ? " outside" : "") + (key === todayKey ? " today" : "");

    const num = document.createElement("div");
    num.className = "day-number";
    num.textContent = cell.day;
    el.appendChild(num);

    const maxShown = 3;
    entries.slice(0, maxShown).forEach((e) => {
      const chip = document.createElement("div");
      chip.className = "chip" + (e.isTalk ? " talk" : "");
      chip.style.setProperty("--hue", hueForName(e.name));
      chip.textContent = e.name;
      el.appendChild(chip);
    });
    if (entries.length > maxShown) {
      const more = document.createElement("div");
      more.className = "more-chip";
      more.textContent = `+${entries.length - maxShown} more`;
      el.appendChild(more);
    }

    if (entries.length) {
      el.addEventListener("click", () => openDayPanel(realDate, entries));
    }

    grid.appendChild(el);
  }
}

function openDayPanel(date, entries) {
  const panel = document.getElementById("day-panel");
  document.getElementById("day-panel-title").textContent = date.toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  const list = document.getElementById("day-panel-list");
  list.innerHTML = "";
  entries.forEach((e) => {
    const li = document.createElement("li");
    const nameEl = document.createElement("div");
    nameEl.className = "entry-name";
    nameEl.textContent = e.name;
    li.appendChild(nameEl);
    if (e.isTalk) {
      const meta = document.createElement("div");
      meta.className = "entry-meta";
      meta.textContent = `Talk: ${e.talkTitle}` + (e.talkTime ? ` at ${e.talkTime}` : "");
      li.appendChild(meta);
    }
    if (e.notes) {
      const notesEl = document.createElement("div");
      notesEl.className = "entry-meta";
      notesEl.textContent = e.notes;
      li.appendChild(notesEl);
    }
    list.appendChild(li);
  });
  panel.hidden = false;
}

function renderUpcoming() {
  const visitorsEl = document.getElementById("upcoming-visitors");
  const talksEl = document.getElementById("upcoming-talks");
  visitorsEl.innerHTML = "";
  talksEl.innerHTML = "";

  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const upcomingVisitors = allVisits
    .filter((v) => v.end >= startOfToday)
    .sort((a, b) => a.start - b.start)
    .slice(0, 8);

  const upcomingTalks = allVisits
    .filter((v) => v.talkTitle && v.talkDate && v.talkDate >= startOfToday)
    .sort((a, b) => a.talkDate - b.talkDate)
    .slice(0, 8);

  if (!upcomingVisitors.length) {
    visitorsEl.innerHTML = `<li class="empty-note">No upcoming visitors.</li>`;
  } else {
    upcomingVisitors.forEach((v) => {
      const li = document.createElement("li");
      const range = v.start.getTime() === v.end.getTime()
        ? v.start.toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : `${v.start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${v.end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
      li.innerHTML = `<div class="entry-name">${escapeHTML(v.name)}</div><div class="entry-meta">${range}</div>`;
      visitorsEl.appendChild(li);
    });
  }

  if (!upcomingTalks.length) {
    talksEl.innerHTML = `<li class="empty-note">No upcoming talks.</li>`;
  } else {
    upcomingTalks.forEach((v) => {
      const li = document.createElement("li");
      const dateStr = v.talkDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      li.innerHTML = `<div class="entry-name">${escapeHTML(v.talkTitle)}</div><div class="entry-meta">${escapeHTML(v.name)} — ${dateStr}${v.talkTime ? ", " + escapeHTML(v.talkTime) : ""}</div>`;
      talksEl.appendChild(li);
    });
  }
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---- Controls ----
document.getElementById("prev-month").addEventListener("click", () => {
  viewMonth--;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  render();
});
document.getElementById("next-month").addEventListener("click", () => {
  viewMonth++;
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  render();
});
document.getElementById("today-btn").addEventListener("click", () => {
  viewYear = today.getFullYear();
  viewMonth = today.getMonth();
  render();
});
document.getElementById("day-panel-close").addEventListener("click", () => {
  document.getElementById("day-panel").hidden = true;
});
document.getElementById("day-panel").addEventListener("click", (e) => {
  if (e.target.id === "day-panel") e.currentTarget.hidden = true;
});
document.getElementById("refresh-btn").addEventListener("click", loadSheet);

// ---- Init ----
loadSheet();
setInterval(loadSheet, 5 * 60 * 1000); // refresh every 5 minutes
