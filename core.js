"use strict";
/* Zeiterfassung — Kernlogik (Port von zeiterfassung.py). Reine Funktionen, ohne DOM. */
(function (root) {
  const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const WOCHENTAGE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
  const TAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const PAUSEN = [[30, "30 Min"], [45, "45 Min"], [60, "1 Std"]];

  const THEMES = {
    "Violett": { bg: "#0e0c1a", panel: "#110f1f", card: "#181428", border: "#2a2542", fg: "#ece8f7", muted: "#9a92b3", accent: "#8b5cf6", accent_fg: "#ffffff", ok: "#2ea36b", warn: "#d9a441", bad: "#d9576b" },
    "Mitternacht": { bg: "#0d1117", panel: "#161b22", card: "#1c2230", border: "#2a3142", fg: "#e6edf3", muted: "#8b95a7", accent: "#4c8dff", accent_fg: "#ffffff", ok: "#2ea36b", warn: "#d9962b", bad: "#d1495b" },
    "Anthrazit": { bg: "#1a1a1c", panel: "#222225", card: "#2a2a2e", border: "#3a3a40", fg: "#ececec", muted: "#9a9aa4", accent: "#e0a030", accent_fg: "#1a1a1c", ok: "#4caf7a", warn: "#e0a030", bad: "#d9534f" },
    "Wald": { bg: "#0e1812", panel: "#14221a", card: "#1a2c21", border: "#28402f", fg: "#e3efe6", muted: "#8aa393", accent: "#3fb97a", accent_fg: "#07140c", ok: "#3fb97a", warn: "#d4a73a", bad: "#cf5a5a" },
    "Ozean": { bg: "#09151d", panel: "#0e202c", card: "#132a3a", border: "#1f3f55", fg: "#e2f0f7", muted: "#86a3b5", accent: "#1fb5c9", accent_fg: "#04161b", ok: "#3fbf8a", warn: "#d9a441", bad: "#d9576b" },
    "Glut": { bg: "#190f10", panel: "#231517", card: "#2c1c1f", border: "#43292d", fg: "#f3e6e7", muted: "#b39598", accent: "#e5484d", accent_fg: "#ffffff", ok: "#4fb98a", warn: "#e0a030", bad: "#e5484d" },
    "AMOLED": { bg: "#000000", panel: "#080808", card: "#111111", border: "#242424", fg: "#f0f0f0", muted: "#8a8a8a", accent: "#00c2a8", accent_fg: "#001a16", ok: "#00c2a8", warn: "#e0a030", bad: "#e5484d" },
  };
  const DEFAULT_SETTINGS = { theme: "Violett", soll_min: 517, topmost: false, pause_plan_min: 30 };

  const pad = (n) => (n < 10 ? "0" + n : "" + n);

  // ---- Zeit ---------------------------------------------------------------
  function parseTime(s) {
    if (s === null || s === undefined) return null;
    s = String(s).trim().replace(/\./g, ":");
    if (!s) return null;
    let parts;
    if (s.includes(":")) parts = s.split(":");
    else if (s.length <= 2) parts = [s, "0"];
    else parts = [s.slice(0, -2), s.slice(-2)];
    const nums = parts.map((p) => {
      if (!/^\d+$/.test(p)) throw new Error("Zeit: " + s);
      return parseInt(p, 10);
    });
    const h = nums[0], m = nums[1], sec = nums.length > 2 ? nums[2] : 0;
    if (!(h >= 0 && h < 24 && m >= 0 && m < 60 && sec >= 0 && sec < 60)) throw new Error("Zeit: " + s);
    return h * 3600 + m * 60 + sec;
  }
  const toStr = (sec) => pad(Math.floor(sec / 3600)) + ":" + pad(Math.floor((sec % 3600) / 60));
  function fmtHM(sec) {
    if (sec === null || sec === undefined) return "–";
    sec = Math.trunc(sec);
    return Math.floor(sec / 3600) + ":" + pad(Math.floor((sec % 3600) / 60));
  }
  function fmtSigned(sec) {
    if (sec === null || sec === undefined) return "–";
    return (sec >= 0 ? "+" : "-") + fmtHM(Math.abs(sec));
  }
  const fmtDec = (sec) => (sec / 3600).toFixed(2).replace(".", ",");
  function parseSoll(s) {
    s = String(s).trim();
    if (/[,.]/.test(s)) {
      const f = parseFloat(s.replace(",", "."));
      if (isNaN(f)) throw new Error("Soll");
      return Math.round((f * 3600) / 60) * 60;
    }
    return parseTime(s);
  }
  function fmtTage(x) {
    if (x === 1) return "1 Tag";
    if (x === 0.5) return "½ Tag";
    return String(x).replace(".", ",") + " Tage";
  }
  const tageField = (x) => (x ? String(x).replace(".", ",") : "");

  // ---- Datum --------------------------------------------------------------
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  function fromIso(s) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const fmtDate = (d) => pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear();
  function parseDate(s) {
    s = String(s).trim();
    let m;
    if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s))) return new Date(+m[3], +m[2] - 1, +m[1]);
    if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) return new Date(+m[1], +m[2] - 1, +m[3]);
    throw new Error("Datum: " + s);
  }
  const weekday = (d) => (d.getDay() + 6) % 7; // Mo=0
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  function isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - dayNum + 3);
    const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((t - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
    return [t.getUTCFullYear(), week];
  }
  const mondayOf = (d) => addDays(d, -weekday(d));

  // ---- Tageswerte ---------------------------------------------------------
  function dayStats(rec, now) {
    const s = parseTime(rec.start);
    if (s === null) return null;
    const e = rec.end ? parseTime(rec.end) : null;
    const effEnd = e !== null ? e : now === undefined ? null : now;
    let pause = 0, openBreak = false;
    for (const b of rec.breaks || []) {
      const bs = parseTime(b[0]);
      let be = b[1] ? parseTime(b[1]) : null;
      if (be === null) {
        openBreak = true;
        be = effEnd !== null ? effEnd : bs;
      }
      pause += Math.max(0, be - bs);
    }
    const work = effEnd !== null ? Math.max(0, effEnd - s - pause) : null;
    return { start: s, end: e, pause, work, open_break: openBreak, complete: e !== null };
  }
  const sollFor = (d, sollMin) => (weekday(d) >= 5 ? 0 : sollMin * 60);
  function dayCalc(d, rec, sollMin, now) {
    const st = dayStats(rec, now);
    const uf = Number(rec.urlaub || 0);
    if (st === null && !uf) return null;
    const soll = sollFor(d, sollMin);
    const credit = Math.round(uf * soll);
    const work = st === null ? 0 : st.work;
    return { st, soll, urlaub: uf, credit, work, ist: work === null ? null : work + credit, pause: st ? st.pause : 0, complete: st === null ? true : st.complete };
  }

  // ---- Auswertungen -------------------------------------------------------
  function weekStats(data, today, now) {
    const mon = mondayOf(today), sm = data.settings.soll_min;
    let work = 0, saldo = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(mon, i), rec = data.days[iso(d)];
      const c = rec ? dayCalc(d, rec, sm, iso(d) === iso(today) ? now : undefined) : null;
      if (!c || c.ist === null) continue;
      work += c.ist;
      if (c.complete) saldo += c.ist - c.soll;
    }
    return { work, soll: sm * 60 * 5, saldo };
  }
  function weekDone(data, monday) {
    const sm = data.settings.soll_min;
    let ist = 0, soll = 0, pause = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i), rec = data.days[iso(d)];
      const c = rec ? dayCalc(d, rec, sm) : null;
      if (c && c.complete) { ist += c.ist; pause += c.pause; soll += c.soll; }
    }
    return { ist, soll, pause };
  }
  function todayInfo(data, now, today) {
    const rec = data.days[iso(today)] || null;
    const st = rec ? dayStats(rec, now) : null;
    const soll = sollFor(today, data.settings.soll_min);
    const plan = (data.settings.pause_plan_min === undefined ? 30 : data.settings.pause_plan_min) * 60;
    const active = st !== null && !st.complete;
    const done = st !== null && st.complete;
    const work = st ? st.work : null;
    const pauseDone = st ? st.pause : 0;
    const start = st ? st.start : now;
    const pEff = Math.max(plan, pauseDone);
    const estEnd = soll ? start + soll + pEff : null;
    return { rec, st, soll, plan, active, done, work, pauseDone, start, pEff, estEnd };
  }
  /** Monatsliste: Wochenzeilen + Tage (absteigend) und Summen. */
  function buildMonth(data, y, m, now, today) {
    const sm = data.settings.soll_min;
    const rows = [];
    const sums = { n: 0, ist: 0, soll: 0, pause: 0, urlaub: 0 };
    let lastWeek = null;
    const keys = Object.keys(data.days).sort().reverse();
    for (const key of keys) {
      const d = fromIso(key);
      if (d.getFullYear() !== y || d.getMonth() + 1 !== m) continue;
      const rec = data.days[key];
      const c = dayCalc(d, rec, sm, key === iso(today) ? now : undefined);
      if (!c) continue;
      const wk = isoWeek(d);
      const wkKey = wk[0] + "-" + wk[1];
      if (wkKey !== lastWeek) {
        lastWeek = wkKey;
        rows.push({ type: "week", kw: wk[1], ...weekDone(data, mondayOf(d)) });
      }
      if (c.complete) { sums.ist += c.ist; sums.soll += c.soll; sums.pause += c.pause; sums.urlaub += c.urlaub; }
      sums.n++;
      rows.push({ type: "day", key, d, c, rec });
    }
    return { rows, sums };
  }

  // ---- CSV ----------------------------------------------------------------
  function csvEscape(v) {
    v = v === null || v === undefined ? "" : String(v);
    return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function buildCsv(data, d1, d2, opts, now, today) {
    const dec = !!opts.dec, dur = dec ? fmtDec : fmtHM, sgn = dec ? fmtDec : fmtSigned;
    const sm = data.settings.soll_min;
    const rows = [["Datum", "Tag", "Kommen", "Gehen", "Pause", "Pausen (Details)", "Urlaub (Tage)", "Ist (inkl. Urlaub)", "Soll", "Saldo", "Notiz"]];
    let tp = 0, tw = 0, ts = 0, tu = 0, n = 0;
    for (const key of Object.keys(data.days).sort()) {
      const d = fromIso(key);
      if (d < d1 || d > d2) continue;
      const rec = data.days[key];
      const c = dayCalc(d, rec, sm, key === iso(today) ? now : undefined);
      if (!c) continue;
      const st = c.st;
      const saldo = c.complete && c.ist !== null ? c.ist - c.soll : null;
      if (c.complete) { tp += c.pause; tw += c.ist; ts += c.soll; tu += c.urlaub; }
      n++;
      rows.push([fmtDate(d), TAGE[weekday(d)], st ? toStr(st.start) : "", st && st.end !== null ? toStr(st.end) : "",
        st ? dur(c.pause) : "", (rec.breaks || []).map((b) => b[0] + "-" + (b[1] || "")).join("; "),
        tageField(c.urlaub), c.ist !== null ? dur(c.ist) : "", dur(c.soll), saldo !== null ? sgn(saldo) : "", rec.note || ""]);
    }
    if (opts.sum) rows.push(["Summe", "", "", "", dur(tp), "", tageField(tu), dur(tw), dur(ts), sgn(tw - ts), ""]);
    return { text: "﻿" + rows.map((r) => r.map(csvEscape).join(";")).join("\r\n") + "\r\n", count: n };
  }

  const api = { MONATE, WOCHENTAGE, TAGE, PAUSEN, THEMES, DEFAULT_SETTINGS, pad, parseTime, toStr, fmtHM, fmtSigned, fmtDec, parseSoll, fmtTage, tageField,
    iso, fromIso, fmtDate, parseDate, weekday, addDays, isoWeek, mondayOf, dayStats, sollFor, dayCalc, weekStats, weekDone, todayInfo, buildMonth, buildCsv };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ZE = api;
})(typeof self !== "undefined" ? self : this);
