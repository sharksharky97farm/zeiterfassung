"use strict";
/* Zeiterfassung (Android/WebView) — Oberfläche. Logik: core.js */
const Z = ZE;
const KEY = "zeiterfassung_daten_v1";
const $ = (s, el) => (el || document).querySelector(s);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nowSec = () => { const n = new Date(); return n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds(); };

// ---- Daten -----------------------------------------------------------------
function loadData() {
  const d = { settings: { ...Z.DEFAULT_SETTINGS }, days: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw) { Object.assign(d.settings, raw.settings || {}); d.days = raw.days || {}; }
  } catch (e) { /* leer starten */ }
  if (!Z.THEMES[d.settings.theme]) d.settings.theme = Z.DEFAULT_SETTINGS.theme;
  return d;
}
let data = loadData();
let page = "heute";
let view = [new Date().getFullYear(), new Date().getMonth() + 1];
let cache = {};
const main = $("#main");

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { toast("Speichern fehlgeschlagen"); }
}
function applyTheme() {
  const t = Z.THEMES[data.settings.theme], r = document.documentElement.style;
  for (const k of ["bg", "panel", "card", "border", "fg", "muted", "accent", "ok", "warn", "bad"]) r.setProperty("--" + k, t[k]);
  r.setProperty("--accent-fg", t.accent_fg);
  try { if (window.Android && Android.setBars) Android.setBars(t.panel); } catch (e) { /* Browser */ }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t.panel);
}

// ---- UI-Helfer ---------------------------------------------------------------
let toastTimer;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 2600);
}
let sheetOpen = false;
function openSheet(html) { $("#sheet").innerHTML = html; $("#ov").classList.add("on"); sheetOpen = true; }
function closeSheet() { $("#ov").classList.remove("on"); sheetOpen = false; }
$("#ov").addEventListener("click", (e) => { if (e.target.id === "ov") closeSheet(); });

/** Auswahl-Dialog; gibt den Index des gewählten Knopfs zurück (-1 = Abbruch). */
function choose(message, labels) {
  return new Promise((resolve) => {
    const ov = document.createElement("div");
    ov.id = "ov2"; ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:30;padding:22px";
    ov.innerHTML = `<div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:18px;width:100%;max-width:380px">
      <div style="white-space:pre-line;margin-bottom:14px">${esc(message)}</div>
      <div class="btns" style="flex-direction:column">${labels.map((l, i) => `<button class="btn ${i === labels.length - 1 ? "primary" : "ghost"}" data-i="${i}">${esc(l)}</button>`).join("")}</div></div>`;
    document.body.appendChild(ov);
    const done = (i) => { ov.remove(); resolve(i); };
    ov.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) done(+b.dataset.i); else if (e.target === ov) done(-1); });
  });
}
const ask = async (msg, yes) => (await choose(msg, ["Abbrechen", yes || "OK"])) === 1;

function saveFile(name, mime, text) {
  try {
    if (window.Android && Android.saveFile) {
      toast(Android.saveFile(name, mime, text) ? "Gespeichert in Downloads: " + name : "Speichern fehlgeschlagen");
      return;
    }
  } catch (e) { /* Browser-Fallback */ }
  // iPhone/Safari: Teilen-Menü ("In Dateien sichern", AirDrop, Mail …); dort funktionieren Blob-Downloads schlecht
  try {
    const file = new File([text], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name }).catch((e) => { if (e && e.name !== "AbortError") toast("Teilen fehlgeschlagen"); });
      return;
    }
  } catch (e) { /* weiter mit Download */ }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

// ---- Navigation --------------------------------------------------------------
function go(p) {
  page = p; cache = {};
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.p === p));
  main.scrollTop = 0;
  ({ heute: renderHeute, verlauf: renderVerlauf, einstellungen: renderEinstellungen })[p]();
}
document.querySelectorAll("#nav button").forEach((b) => b.addEventListener("click", () => go(b.dataset.p)));
window.__back = () => {
  if ($("#ov2")) { $("#ov2").remove(); return true; }
  if (sheetOpen) { closeSheet(); return true; }
  if (page !== "heute") { go("heute"); return true; }
  return false;
};
function commit() { save(); go(page); }

// ---- Heute -------------------------------------------------------------------
const CIRC = 2 * Math.PI * 82;
function renderHeute() {
  main.innerHTML = `
  <div class="head"><div><h1 id="greet"></h1><div class="sub" id="date"></div></div><div class="clock" id="clock"></div></div>
  <div class="card">
    <div class="stamp">
      <div class="ringwrap"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="82" fill="none" style="stroke:var(--border)" stroke-width="16"/><circle id="ringp" cx="100" cy="100" r="82" fill="none" style="stroke:var(--accent)" stroke-width="16" stroke-linecap="round" stroke-dasharray="0 600"/></svg>
        <div class="ringtxt"><b id="rwork">0:00</b><span class="small" id="rsub"></span><span class="small" id="rpct" style="color:var(--accent);font-weight:700"></span></div></div>
      <div class="ctl"><div class="cap">Stempeluhr</div>
        <div style="margin-top:6px;font-weight:700"><span class="dot" id="dot"></span><span id="status"></span></div><div class="small" id="since"></div>
        <button class="btn ok" id="bin">▶  Kommen</button><button class="btn warn" id="bpause">⏸  Pause starten</button><button class="btn bad" id="bout">■  Gehen</button></div>
    </div>
    <a class="link" id="edit">✎  Zeiten anpassen</a>
  </div>
  <div class="card">
    <div class="row sb"><span class="cap">Feierabend-Rechner</span><span class="small">Wann kann ich gehen?</span></div>
    <div class="fe"><div class="big" id="fetime"></div><div><b id="feleft"></b><div class="small" id="fesub"></div></div></div>
    <div class="small" id="feform"></div>
    <div id="chipbox"><div class="sep"></div><div class="cap">Wie lange machst du heute Pause?</div>
      <div class="chips">${Z.PAUSEN.map(([m, l]) => `<div class="chip" data-m="${m}"><div class="c">${l}</div><div class="u"></div></div>`).join("")}</div></div>
  </div>
  <div class="grid2"><div class="card" data-edit><div class="cap">Kommen</div><div class="val" id="c_in"></div><div class="small" id="c_in_s"></div></div>
    <div class="card" data-edit><div class="cap">Pause</div><div class="val" id="c_pause"></div><div class="small" id="c_pause_s"></div></div></div>
  <div class="grid2"><div class="card" data-edit><div class="cap">Gehen</div><div class="val" id="c_out"></div><div class="small" id="c_out_s"></div></div>
    <div class="card"><div class="cap">Diese Woche</div><div class="val" id="c_week"></div><div class="small" id="c_week_s"></div><div class="bar"><i id="c_week_bar"></i></div></div></div>
  <div class="card"><div class="row sb"><span class="cap">Tagesverlauf</span><span class="legend"><span><i style="background:var(--accent)"></i>Arbeit</span><span><i style="background:var(--warn)"></i>Pause</span><span><i style="background:var(--planned)"></i>geplant</span></span></div>
    <svg id="tl"></svg></div>`;
  $("#bin").onclick = doKommen; $("#bpause").onclick = doPause; $("#bout").onclick = doGehen;
  $("#edit").onclick = editToday;
  main.querySelectorAll("[data-edit]").forEach((el) => (el.onclick = editToday));
  main.querySelectorAll(".chip").forEach((el) => (el.onclick = () => { data.settings.pause_plan_min = +el.dataset.m; save(); updateHeute(); }));
  updateHeute();
}
const editToday = () => openEntry(Z.iso(new Date()) in data.days ? Z.iso(new Date()) : null);

function updateHeute() {
  if (page !== "heute" || !$("#clock")) return;
  const n = new Date(), now = nowSec(), today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  const T = Z.todayInfo(data, now, today), { rec, st, soll, plan, active, done, work, pauseDone, start, pEff, estEnd } = T;
  const h = n.getHours();
  $("#greet").textContent = h < 11 ? "Guten Morgen" : h < 17 ? "Guten Tag" : "Guten Abend";
  $("#date").textContent = `${Z.WOCHENTAGE[Z.weekday(today)]}, ${n.getDate()}. ${Z.MONATE[n.getMonth()]} ${n.getFullYear()} · KW ${Z.isoWeek(today)[1]}`;
  $("#clock").textContent = n.toLocaleTimeString("de-CH", { hour12: false });

  let text, since = " ", color = "var(--muted)";
  if (st === null && rec && rec.urlaub) { text = "Urlaub"; since = Z.fmtTage(rec.urlaub) + " eingetragen"; color = "var(--accent)"; }
  else if (st === null) text = "Nicht eingestempelt";
  else if (done) { text = "Feierabend"; since = "gegangen um " + Z.toStr(st.end); }
  else if (st.open_break) { text = "In Pause"; since = "seit " + ((rec.breaks.find((b) => !b[1]) || [""])[0]); color = "var(--warn)"; }
  else { text = "Bei der Arbeit"; since = "seit " + Z.toStr(st.start); color = "var(--ok)"; }
  $("#status").textContent = text; $("#since").textContent = since; $("#dot").style.background = color;
  $("#bin").disabled = !(st === null || done); $("#bout").disabled = !active; $("#bpause").disabled = !active;
  $("#bpause").textContent = active && st.open_break ? "⏵  Pause beenden" : "⏸  Pause starten";

  const frac = work !== null && soll ? work / soll : 0;
  const rp = $("#ringp");
  rp.setAttribute("stroke-dasharray", Math.min(frac, 1) * CIRC + " 600"); rp.style.opacity = frac > 0 ? 1 : 0;
  rp.style.stroke = frac >= 1 ? "var(--ok)" : "var(--accent)";
  $("#rwork").textContent = work !== null ? Z.fmtHM(work) : "0:00";
  $("#rsub").textContent = soll ? "von " + Z.fmtHM(soll) + " Soll" : "kein Soll";
  $("#rpct").textContent = soll ? Math.round(frac * 100) + " %" : " ";

  let big, left, sub, form = " ", showChips = true;
  if (done) { big = Z.toStr(st.end); left = "Feierabend"; sub = `Ist ${Z.fmtHM(work)} · Soll ${Z.fmtHM(soll)}`; showChips = false; }
  else if (!soll) { big = "–"; left = "Kein Soll heute"; sub = "Heute ist kein Sollarbeitstag."; showChips = false; }
  else {
    big = Z.toStr(estEnd % 86400);
    if (st === null) { left = "Wenn du jetzt kommst"; sub = `Soll ${Z.fmtHM(soll)} + Pause ${Z.fmtHM(pEff)}`; }
    else {
      const rem = estEnd - now;
      if (rem > 0) { left = "noch " + Z.fmtHM(rem) + " Std."; sub = `bis Feierabend · davon ${Z.fmtHM(pEff)} Pause${pEff > pauseDone ? ", die noch kommt" : ""}`; }
      else { left = "Soll erreicht ✓"; sub = "Du kannst gehen."; }
      form = `Kommen ${Z.toStr(start)} + Soll ${Z.fmtHM(soll)} + Pause ${Z.fmtHM(pEff)} = ${big}`;
    }
  }
  $("#fetime").textContent = big; $("#feleft").textContent = left; $("#fesub").textContent = sub; $("#feform").textContent = form;
  $("#chipbox").style.display = showChips ? "" : "none";
  main.querySelectorAll(".chip").forEach((el) => {
    const m = +el.dataset.m;
    el.classList.toggle("sel", plan === m * 60);
    $(".u", el).textContent = soll && showChips ? "bis " + Z.toStr((start + soll + Math.max(m * 60, pauseDone)) % 86400) : "";
  });

  $("#c_in").textContent = st ? Z.toStr(st.start) : "–";
  $("#c_in_s").textContent = active ? `seit ${Z.fmtHM(now - st.start)} Std. da` : done ? `Dauer ${Z.fmtHM(st.end - st.start)} Std.` : " ";
  $("#c_pause").textContent = st ? Z.fmtHM(pauseDone) : "–";
  const nb = rec && rec.breaks ? rec.breaks.length : 0;
  $("#c_pause_s").textContent = `${nb} ${nb === 1 ? "Pause" : "Pausen"} · geplant ${Z.fmtHM(plan)}`;
  const co = $("#c_out");
  if (done) { co.textContent = Z.toStr(st.end); co.style.color = "var(--fg)"; $("#c_out_s").textContent = "gegangen"; }
  else if (active && estEnd) { co.textContent = "~ " + Z.toStr(estEnd % 86400); co.style.color = "var(--accent)"; $("#c_out_s").textContent = `geschätzt (mit ${Z.fmtHM(pEff)} Pause)`; }
  else { co.textContent = "–"; co.style.color = "var(--fg)"; $("#c_out_s").textContent = " "; }
  const W = Z.weekStats(data, today, now);
  $("#c_week").textContent = Z.fmtHM(W.work);
  const cs = $("#c_week_s"); cs.textContent = `von ${Z.fmtHM(W.soll)} · Saldo ${Z.fmtSigned(W.saldo)}`; cs.style.color = W.saldo < 0 ? "var(--bad)" : "var(--ok)";
  $("#c_week_bar").style.width = Math.min(W.work / W.soll, 1) * 100 + "%";

  drawTimeline(rec, st, now, estEnd, active, done);
}

function drawTimeline(rec, st, now, estEnd, active, done) {
  const el = $("#tl"), W = el.clientWidth;
  if (W < 100) return;
  const key = [W, Math.floor(now / 60), JSON.stringify(rec), estEnd, active, data.settings.theme].join("|");
  if (cache.tl === key) return;
  cache.tl = key;
  let lo = 7 * 3600, hi = 17 * 3600;
  if (st) {
    lo = Math.min(lo, Math.floor(st.start / 3600) * 3600);
    const upper = Math.max(st.end !== null ? st.end : now, active && estEnd ? estEnd : 0);
    hi = Math.max(hi, Math.ceil(upper / 3600) * 3600);
  }
  const pad = 20, x = (t) => pad + ((t - lo) / (hi - lo)) * (W - 2 * pad), y0 = 30, y1 = 46;
  let s = `<rect x="${pad}" y="${y0}" width="${W - 2 * pad}" height="${y1 - y0}" rx="3" style="fill:var(--border)"/>`;
  const seg = (a, b, c) => { if (b > a) s += `<rect x="${x(a)}" y="${y0}" width="${Math.max(x(b) - x(a), 2)}" height="${y1 - y0}" style="fill:${c}"/>`; };
  const txt = (xx, yy, t, anchor, cls) => `<text x="${xx}" y="${yy}" text-anchor="${anchor}" style="fill:${cls ? "var(--fg)" : "var(--muted)"};font:${cls ? "700 11px" : "10px"} system-ui">${t}</text>`;
  if (st) {
    const sS = st.start, e = st.end !== null ? st.end : now;
    if (active && estEnd && estEnd > now) seg(now, estEnd, "var(--planned)");
    const br = [];
    for (const b of rec.breaks || []) {
      const bs = Math.max(Z.parseTime(b[0]), sS), be = Math.min(b[1] ? Z.parseTime(b[1]) : e, e);
      if (be > bs) br.push([bs, be]);
    }
    br.sort((a, b) => a[0] - b[0]);
    let cur = sS;
    for (const [bs, be] of br) { seg(cur, bs, "var(--accent)"); cur = Math.max(cur, be); }
    seg(cur, e, "var(--accent)");
    for (const [bs, be] of br) seg(bs, be, "var(--warn)");
    s += txt(x(sS), 16, "Kommen " + Z.toStr(sS), "start", 1);
    const endX = done ? x(e) : estEnd ? x(estEnd) : null, endT = done ? "Gegangen " + Z.toStr(e) : estEnd ? "Feierabend ~" + Z.toStr(estEnd % 86400) : "";
    if (endX !== null) {
      if (endX - x(sS) < 200) s += txt(x(sS) + 100, 16, endT, "start", 1);
      else s += txt(endX, 16, endT, "end", 1);
    }
    if (active) s += `<line x1="${x(now)}" x2="${x(now)}" y1="${y0 - 5}" y2="${y1 + 5}" style="stroke:var(--fg)" stroke-width="2"/>`;
  }
  const step = hi - lo <= 12 * 3600 ? 1 : 2;
  for (let h = lo / 3600; h <= hi / 3600; h += step) s += txt(x(h * 3600), 72, (h % 24) + ":00", "middle", 0);
  el.setAttribute("viewBox", `0 0 ${W} 84`);
  el.innerHTML = s;
}

// ---- Aktionen ----------------------------------------------------------------
async function doKommen() {
  const key = Z.iso(new Date()), now = Z.toStr(nowSec());
  const rec = data.days[key];
  if (!rec) data.days[key] = { start: now, end: null, breaks: [], note: "" };
  else if (!rec.start) rec.start = now;
  else if (rec.end) {
    if (!(await ask(`Du bist heute schon gegangen (${rec.end}).\n\nWieder einstempeln? Die Zeit zwischen Gehen und jetzt wird als Pause gebucht.`, "Einstempeln"))) return;
    rec.breaks.push([rec.end, now]); rec.end = null;
  }
  save(); updateHeute();
}
function doPause() {
  const rec = data.days[Z.iso(new Date())];
  if (!rec || !rec.start || rec.end) return;
  const now = Z.toStr(nowSec()), open = rec.breaks.find((b) => !b[1]);
  if (open) open[1] = now; else rec.breaks.push([now, null]);
  save(); updateHeute();
}
function doGehen() {
  const rec = data.days[Z.iso(new Date())];
  if (!rec || !rec.start || rec.end) return;
  const now = Z.toStr(nowSec());
  rec.breaks.forEach((b) => { if (!b[1]) b[1] = now; });
  rec.end = now; save(); updateHeute();
}

// ---- Dialoge -----------------------------------------------------------------
function openEntry(key) {
  const rec = key ? data.days[key] : null, d = key ? Z.fromIso(key) : new Date();
  openSheet(`<h2>${key ? "Eintrag bearbeiten" : "Eintrag hinzufügen"}</h2>
    <label class="f">Datum</label><input type="date" id="e_date" value="${Z.iso(d)}">
    <label class="f">Urlaub</label><select id="e_urlaub"><option value="0">Kein Urlaub</option><option value="0.5">Halber Tag</option><option value="1">Ganzer Tag</option></select>
    <div class="two"><div><label class="f">Kommen</label><input type="time" id="e_start" value="${rec && rec.start ? rec.start : ""}"></div>
    <div><label class="f">Gehen</label><input type="time" id="e_end" value="${rec && rec.end ? rec.end : ""}"></div></div>
    <div class="hint">Gehen leer lassen, wenn noch offen. Bei ganztägigem Urlaub beide leer lassen.</div>
    <label class="f">Pausen</label><input id="e_breaks" placeholder="12:00-12:30; 15:00-15:10" value="${esc((rec && rec.breaks || []).map((b) => b[0] + "-" + (b[1] || "")).join("; "))}">
    <label class="f">Notiz</label><input id="e_note" value="${esc(rec ? rec.note : "")}">
    <div class="err" id="e_err"></div>
    <div class="btns">${key ? '<button class="btn bad" id="e_del">Löschen</button>' : ""}<button class="btn ghost" id="e_cancel">Abbrechen</button><button class="btn primary" id="e_save">Speichern</button></div>`);
  $("#e_urlaub").value = String(rec && rec.urlaub ? rec.urlaub : 0);
  $("#e_cancel").onclick = closeSheet;
  if (key) $("#e_del").onclick = async () => {
    if (await ask(`Eintrag vom ${Z.fmtDate(d)} wirklich löschen?`, "Löschen")) { delete data.days[key]; closeSheet(); commit(); }
  };
  $("#e_save").onclick = async () => {
    const err = (m) => { $("#e_err").textContent = m; };
    let nd; try { nd = Z.parseDate($("#e_date").value); } catch (e) { return err("Ungültiges Datum."); }
    let s, e;
    try { s = Z.parseTime($("#e_start").value); e = Z.parseTime($("#e_end").value); } catch (x) { return err("Ungültige Uhrzeit bei Kommen/Gehen."); }
    const uf = +$("#e_urlaub").value;
    if (s === null && !uf) return err("Bitte eine Kommen-Zeit oder Urlaub angeben.");
    if (s === null && e !== null) return err("Gehen ohne Kommen ist nicht möglich.");
    if (e !== null && e < s) return err("Gehen liegt vor Kommen.");
    const breaks = [];
    try {
      for (const part of $("#e_breaks").value.replace(/,/g, ";").split(";")) {
        const p = part.trim(); if (!p) continue;
        const [a, , b] = p.replace("–", "-").split(/(-)/);
        const bs = Z.parseTime(a), be = Z.parseTime(b);
        if (bs === null || (be !== null && be < bs)) throw new Error(p);
        breaks.push([Z.toStr(bs), be !== null ? Z.toStr(be) : null]);
      }
    } catch (x) { return err("Pause nicht lesbar. Format: 12:00-12:30; 15:00-15:10"); }
    const nk = Z.iso(nd);
    if (nk !== key && data.days[nk] && !(await ask("Für dieses Datum gibt es schon einen Eintrag. Überschreiben?", "Überschreiben"))) return;
    if (key && key !== nk) delete data.days[key];
    const r = { start: s !== null ? Z.toStr(s) : null, end: e !== null ? Z.toStr(e) : null, breaks: s !== null ? breaks : [], note: $("#e_note").value.trim() };
    if (uf) r.urlaub = uf;
    data.days[nk] = r; closeSheet(); commit();
  };
}

function openVacation() {
  const today = Z.iso(new Date());
  openSheet(`<h2>Urlaub eintragen</h2>
    <div class="two"><div><label class="f">Von</label><input type="date" id="v_from" value="${today}"></div><div><label class="f">Bis</label><input type="date" id="v_to" value="${today}"></div></div>
    <label class="f">Umfang</label><select id="v_part"><option value="1">Ganzer Tag</option><option value="0.5">Halber Tag</option></select>
    <label class="f">Notiz (optional)</label><input id="v_note">
    <div class="hint">Eingetragen werden nur Arbeitstage (Mo–Fr). Ein ganzer Urlaubstag zählt als Sollzeit (${Z.fmtHM(data.settings.soll_min * 60)}).</div>
    <div class="err" id="v_err"></div>
    <div class="btns"><button class="btn ghost" id="v_cancel">Abbrechen</button><button class="btn primary" id="v_save">Eintragen</button></div>`);
  $("#v_cancel").onclick = closeSheet;
  $("#v_from").onchange = () => { if ($("#v_to").value < $("#v_from").value) $("#v_to").value = $("#v_from").value; };
  $("#v_save").onclick = async () => {
    const err = (m) => { $("#v_err").textContent = m; };
    let d1, d2; try { d1 = Z.parseDate($("#v_from").value); d2 = Z.parseDate($("#v_to").value); } catch (e) { return err("Ungültiges Datum."); }
    const span = Math.round((d2 - d1) / 86400000);
    if (span < 0 || span > 366) return err("Zeitraum ungültig (Bis vor Von oder länger als ein Jahr).");
    const part = +$("#v_part").value, todo = [];
    for (let i = 0; i <= span; i++) { const d = Z.addDays(d1, i); if (Z.weekday(d) < 5) todo.push(d); }
    if (!todo.length) return err("Im Zeitraum liegen keine Arbeitstage (Mo–Fr).");
    const worked = todo.filter((d) => (data.days[Z.iso(d)] || {}).start);
    if (worked.length && part === 1 && !(await ask(`An ${worked.length} Tag(en) sind schon Arbeitszeiten eingetragen (z. B. ${Z.fmtDate(worked[0])}).\nDer Urlaub wird dort zusätzlich vermerkt und zählt zur Arbeitszeit dazu.`, "Fortfahren"))) return;
    const note = $("#v_note").value.trim();
    for (const d of todo) {
      const k = Z.iso(d), r = data.days[k] || (data.days[k] = { start: null, end: null, breaks: [], note: "" });
      r.urlaub = part; if (note) r.note = note;
    }
    closeSheet(); commit(); toast(todo.length + " Tag(e) Urlaub eingetragen");
  };
}

function openExport() {
  const [y, m] = view, first = new Date(y, m - 1, 1), last = new Date(y, m, 0);
  openSheet(`<h2>CSV-Export</h2>
    <div class="two"><div><label class="f">Von</label><input type="date" id="x_from" value="${Z.iso(first)}"></div><div><label class="f">Bis</label><input type="date" id="x_to" value="${Z.iso(last)}"></div></div>
    <label class="chk"><input type="checkbox" id="x_dec"> Dauern als Dezimalstunden (z. B. 7,50 statt 7:30)</label>
    <label class="chk"><input type="checkbox" id="x_sum" checked> Summenzeile anhängen</label>
    <div class="err" id="x_err"></div>
    <div class="btns"><button class="btn ghost" id="x_cancel">Abbrechen</button><button class="btn primary" id="x_go">Exportieren</button></div>`);
  $("#x_cancel").onclick = closeSheet;
  $("#x_go").onclick = () => {
    let d1, d2; try { d1 = Z.parseDate($("#x_from").value); d2 = Z.parseDate($("#x_to").value); } catch (e) { return ($("#x_err").textContent = "Ungültiges Datum."); }
    if (d2 < d1) return ($("#x_err").textContent = "'Bis' liegt vor 'Von'.");
    const n = new Date(), res = Z.buildCsv(data, d1, d2, { dec: $("#x_dec").checked, sum: $("#x_sum").checked }, nowSec(), new Date(n.getFullYear(), n.getMonth(), n.getDate()));
    closeSheet();
    saveFile(`Zeiterfassung_${Z.iso(d1)}_bis_${Z.iso(d2)}.csv`, "text/csv", res.text);
  };
}

// ---- Verlauf -----------------------------------------------------------------
function renderVerlauf() {
  const [y, m] = view, n = new Date(), today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  const M = Z.buildMonth(data, y, m, nowSec(), today), sm = data.settings.soll_min;
  const cls = (v) => (v < 0 ? "var(--bad)" : v > 0 ? "var(--ok)" : "var(--muted)");
  let list = "";
  for (const r of M.rows) {
    if (r.type === "week") { list += `<div class="wk"><span>KW ${r.kw}</span><span>Soll ${Z.fmtHM(r.soll)} · Ist ${Z.fmtHM(r.ist)} · <span style="color:${cls(r.ist - r.soll)}">${Z.fmtSigned(r.ist - r.soll)}</span></span></div>`; continue; }
    const { c, d, rec, key } = r, st = c.st;
    let sub;
    if (st) sub = `${Z.toStr(st.start)}–${st.end !== null ? Z.toStr(st.end) : "offen"} · Pause ${Z.fmtHM(c.pause)}`;
    else sub = `Urlaub (${Z.fmtTage(c.urlaub)})`;
    if (st && c.urlaub) sub += ` · inkl. ${Z.fmtTage(c.urlaub)} Urlaub`;
    if (rec.note) sub += " · " + esc(rec.note);
    const classes = ["day", !st && c.urlaub ? "urlaub" : "", Z.weekday(d) >= 5 ? "we" : "", !c.complete && key !== Z.iso(today) ? "open" : ""].join(" ");
    list += `<div class="${classes}" data-k="${key}"><div class="l"><b>${Z.TAGE[Z.weekday(d)]} ${Z.fmtDate(d).slice(0, 6)}</b><span>${sub}</span></div>
      <div class="r"><b>${Z.fmtHM(c.ist)}</b><span style="color:${c.complete ? cls(c.ist - c.soll) : "var(--muted)"}">${c.complete ? Z.fmtSigned(c.ist - c.soll) : "–"}</span></div></div>`;
  }
  const S = M.sums, saldo = S.ist - S.soll, kw = Z.isoWeek(today)[1], W = Z.weekDone(data, Z.mondayOf(today));
  const cell = (cap, v, col) => `<div class="card"><div class="cap">${cap}</div><div class="val" ${col ? `style="color:${col}"` : ""}>${v}</div></div>`;
  main.innerHTML = `<h1>Verlauf</h1><div class="sub" style="margin-bottom:12px">Tippen zum Bearbeiten</div>
    <div class="mnav"><button id="m_prev">‹</button><b>${Z.MONATE[m - 1]} ${y}</b><button id="m_next">›</button></div>
    <div class="acts"><button class="btn ghost" id="a_add">+ Eintrag</button><button class="btn ghost" id="a_vac">+ Urlaub</button><button class="btn primary" id="a_csv">CSV</button></div>
    ${list || '<div class="sub" style="padding:24px 0;text-align:center">Keine Einträge in diesem Monat.</div>'}
    <h3>Monat</h3><div class="sums">${cell("Tage", S.n)}${cell("Ist", Z.fmtHM(S.ist))}${cell("Soll", Z.fmtHM(S.soll))}${cell("Saldo", Z.fmtSigned(saldo), saldo < 0 ? "var(--bad)" : "var(--ok)")}${cell("Pausen", Z.fmtHM(S.pause))}${cell("Urlaub", S.urlaub ? Z.fmtTage(S.urlaub) : "–")}</div>
    <h3>KW ${kw} (aktuelle Woche)</h3><div class="sums">${cell("Soll", Z.fmtHM(W.soll))}${cell("Ist", Z.fmtHM(W.ist))}${cell("Saldo", Z.fmtSigned(W.ist - W.soll), W.ist < W.soll ? "var(--bad)" : "var(--ok)")}</div>`;
  const shift = (dl) => { let mm = m + dl, yy = y; if (mm < 1) { mm = 12; yy--; } else if (mm > 12) { mm = 1; yy++; } view = [yy, mm]; go("verlauf"); };
  $("#m_prev").onclick = () => shift(-1); $("#m_next").onclick = () => shift(1);
  $("#a_add").onclick = () => openEntry(null); $("#a_vac").onclick = openVacation; $("#a_csv").onclick = openExport;
  main.querySelectorAll(".day").forEach((el) => (el.onclick = () => openEntry(el.dataset.k)));
}

// ---- Einstellungen -----------------------------------------------------------
function renderEinstellungen() {
  const cur = data.settings.theme;
  main.innerHTML = `<h1>Einstellungen</h1><div class="sub">Farbschema, Sollzeit und Daten</div>
    <h3>Farbschema</h3><div class="themes">${Object.entries(Z.THEMES).map(([name, t]) =>
      `<div class="theme ${name === cur ? "sel" : ""}" data-t="${name}" style="background:${t.bg}"><b style="color:${t.fg}">${name}${name === cur ? " ✓" : ""}</b><div class="sw">${["panel", "card", "accent", "ok", "warn", "bad"].map((k) => `<i style="background:${t[k]}"></i>`).join("")}</div></div>`).join("")}</div>
    <h3>Arbeitszeit</h3><label class="f">Sollzeit pro Arbeitstag (Mo–Fr) — H:MM oder Dezimal, z. B. 8:37 oder 8,62</label>
    <input id="s_soll" inputmode="decimal" value="${Z.fmtHM(data.settings.soll_min * 60)}"><div class="hint" id="s_info">&nbsp;</div>
    <h3>Daten</h3><div class="sub">Die Daten liegen nur auf diesem Gerät. Zum Sichern oder Übertragen vom PC (<code>daten.json</code>) gibt es Export und Import.</div>
    <div class="acts" style="margin-top:10px"><button class="btn ghost" id="d_exp">Sicherung exportieren</button><button class="btn ghost" id="d_imp">Importieren…</button></div>
    <input type="file" id="d_file" accept=".json,application/json" style="display:none">
    <div class="small" style="margin-top:18px">Zeiterfassung · Version ${window.APP_VERSION || "1.0"}</div>`;
  main.querySelectorAll(".theme").forEach((el) => (el.onclick = () => { data.settings.theme = el.dataset.t; save(); applyTheme(); cache = {}; renderEinstellungen(); }));
  $("#s_soll").oninput = (e) => {
    let sec = null; try { sec = Z.parseSoll(e.target.value); } catch (x) { /* unvollständig */ }
    if (sec === null || sec <= 0 || sec >= 86400) { $("#s_info").textContent = " "; return; }
    data.settings.soll_min = Math.floor(sec / 60); save(); $("#s_info").textContent = "✓ gespeichert";
  };
  $("#s_soll").onblur = (e) => { e.target.value = Z.fmtHM(data.settings.soll_min * 60); };
  $("#d_exp").onclick = () => saveFile(`Zeiterfassung_Sicherung_${Z.iso(new Date())}.json`, "application/json", JSON.stringify(data, null, 1));
  $("#d_imp").onclick = () => $("#d_file").click();
  $("#d_file").onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = async () => {
      let obj;
      try {
        obj = JSON.parse(String(rd.result).replace(/^﻿/, ""));
        if (!obj || typeof obj.days !== "object") throw new Error();
        for (const [k, r] of Object.entries(obj.days)) if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || typeof r !== "object" || (r.start && Z.parseTime(r.start) === null && !r.urlaub)) throw new Error(k);
      } catch (x) { return toast("Datei nicht lesbar (keine gültige Zeiterfassung-Sicherung)."); }
      const nd = Object.keys(obj.days).length;
      const i = await choose(`${nd} Tage in der Datei.\n\nZusammenführen: Tage aus der Datei überschreiben gleiche Daten, alle anderen bleiben.\nErsetzen: alle bisherigen Daten werden gelöscht.`, ["Abbrechen", "Ersetzen", "Zusammenführen"]);
      if (i < 1) return;
      if (i === 1) { data.days = {}; if (obj.settings) Object.assign(data.settings, obj.settings); }
      for (const [k, r] of Object.entries(obj.days)) { r.breaks = r.breaks || []; r.note = r.note || ""; data.days[k] = r; }
      if (!Z.THEMES[data.settings.theme]) data.settings.theme = Z.DEFAULT_SETTINGS.theme;
      save(); applyTheme(); toast(nd + " Tage importiert"); renderEinstellungen();
    };
    rd.readAsText(f); e.target.value = "";
  };
}

// ---- Start -------------------------------------------------------------------
applyTheme();
go("heute");
let lastDay = Z.iso(new Date());
setInterval(() => {
  if (Z.iso(new Date()) !== lastDay) { lastDay = Z.iso(new Date()); go(page); return; }
  if (page === "heute" && !sheetOpen) updateHeute();
}, 1000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) updateHeute(); });
// Web-App (https): Offline-Modus + Speicher gegen Aufräumen schützen. In der Android-Hülle (file://) nicht nötig.
if (location.protocol === "https:" || location.hostname === "localhost") {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}
window.addEventListener("resize", () => { cache = {}; updateHeute(); });
