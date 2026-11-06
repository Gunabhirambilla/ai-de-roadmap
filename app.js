/* AI Data Engineer Roadmap: reads data.json (synced from Notion by a GitHub Action) and draws a zoomable skill curve. */
(() => {
"use strict";

const PHASES = [
  { n: 1, name: "Python + SQL mastery", short: "Python + SQL", w: [1, 8], focus: "Python from 20% to job-ready, advanced SQL, Git, Linux", pdesc: "API to Postgres ingestion with incremental loads." },
  { n: 2, name: "Storage + data modeling", short: "Storage + modeling", w: [9, 14], focus: "Modeling, NoSQL, file formats, lakehouse, partitioning", pdesc: "Iceberg or Delta tables with real layout tuning." },
  { n: 3, name: "Core data engineering", short: "Core data engineering", w: [15, 22], focus: "Spark, Airflow, dbt, Kafka, CDC, data tests", pdesc: "Spark, Airflow, dbt and Kafka in one pipeline." },
  { n: 4, name: "Cloud + infrastructure", short: "Cloud + infra", w: [23, 28], focus: "AWS, Docker, Kubernetes basics, Terraform, CI/CD", pdesc: "Phase 3 pipeline deployed with Terraform." },
  { n: 5, name: "Math + ML + MLOps", short: "Math + ML + MLOps", w: [29, 36], focus: "Stats, linear algebra, ML basics, feature stores, MLflow", pdesc: "Features, training and serving end to end." },
  { n: 6, name: "LLM + GenAI data engineering", short: "LLM + GenAI DE", w: [37, 44], focus: "Unstructured data, embeddings, vector DBs, RAG, evals, LLM pipelines", pdesc: "Production-style retrieval with an eval suite." },
  { n: 7, name: "Quality, governance, observability", short: "Quality + governance", w: [45, 48], focus: "Data quality, lineage, catalogs, PII, AI governance", pdesc: "Contracts, lineage and PII rules on prior work." },
  { n: 8, name: "System design + capstone + job prep", short: "Capstone + job prep", w: [49, 52], focus: "Design interviews, capstone, resume, interviews", pdesc: "Everything above in one end-to-end platform." }
];
const PAGE_LINK = "https://app.notion.com/p/3f093ebae4ea81df8a17c98fe1486406";
const DAY = 864e5, WEEK = 7 * DAY;
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const NS = "http://www.w3.org/2000/svg";

const $ = id => document.getElementById(id);
const svg = $("chart"), wrapEl = $("chartWrap"), tip = $("tip");
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pad = n => String(n).padStart(2, "0");
const notion = id => "https://app.notion.com/p/" + id;
const parseDate = s => s ? Date.parse(s.slice(0, 10) + "T00:00:00Z") : null;
const fmt = (ms, yr) => { const d = new Date(ms); return MON[d.getUTCMonth()] + " " + d.getUTCDate() + (yr ? ", " + d.getUTCFullYear() : ""); };
const isDone = s => s === "Done" || s === "Fast-tracked";
const sKey = s => isDone(s) ? "done" : s === "In progress" ? "now" : s === "Blocked" ? "block" : "todo";
const sPill = s => `<span class="status ${{ done: "s-done", now: "s-now", block: "s-block", todo: "s-idle" }[sKey(s)]}">${esc(s)}</span>`;
const stripPrefix = t => t.replace(/^\s*W\d+\s*[·.:\-–]\s*/, "").replace(/^[^\w(]*?(P\d+\s+)?(Project|Capstone|Checkpoint|Final Checkpoint)\s*[·.:\-–]\s*/i, "").trim();

/* ---------------- state ---------------- */
let N = 52, START = Date.UTC(2026, 9, 5);
let weeks = [], events = [], projects = {}, checkpoints = {}, skillsTable = [];
let activeWeek = 1, calWeek = 1;
let view = { a: 0, b: 52 };
let sel = { kind: "week", n: 1 };
let filters = { q: "", skill: "", status: "" };
let tab = "proj";
let geo = null;

/* ---------------- data ---------------- */
function build(data) {
  const items = data.items || [];
  weeks = items.filter(i => /learn/i.test(i.type || "") && Number.isFinite(i.week))
    .map(i => ({ ...i, n: i.week, title: stripPrefix(i.task), startMs: parseDate(i.start) }))
    .sort((x, y) => x.n - y.n);
  if (!weeks.length) throw new Error("No weekly rows found in data.json");
  N = Math.max(52, weeks[weeks.length - 1].n);
  START = (weeks[0].startMs ?? START) - (weeks[0].n - 1) * WEEK;
  weeks.forEach(w => {
    if (w.startMs == null) w.startMs = START + (w.n - 1) * WEEK;
    w.phase = PHASES.find(p => w.n >= p.w[0] && w.n <= p.w[1]) || PHASES[PHASES.length - 1];
  });
  const phaseOf = (i, fallbackLast) => {
    const m = /\bP(\d+)\b/.exec(i.task);
    if (m) return +m[1];
    if (fallbackLast && /final/i.test(i.task)) return 8;
    const d = parseDate(i.start);
    const w = d == null ? null : Math.floor((d - START) / WEEK) + 1;
    return (PHASES.find(p => w >= p.w[0] && w <= p.w[1]) || {}).n;
  };
  projects = {}; checkpoints = {}; events = [];
  items.forEach(i => {
    const t = i.type || "";
    if (/project/i.test(t)) projects[phaseOf(i)] = { ...i, title: stripPrefix(i.task) };
    else if (/checkpoint/i.test(t)) checkpoints[phaseOf(i, true)] = { ...i, title: stripPrefix(i.task) };
    else if (/check-in|certification/i.test(t) && i.start) {
      events.push({ ...i, date: parseDate(i.start), cert: /certification/i.test(t),
        title: i.task.replace(/^[^\w]+/, "").trim() });
    }
  });
  skillsTable = data.skills || [];
  activeWeek = (weeks.find(w => w.status === "In progress") || weeks.find(w => !isDone(w.status)) || weeks[weeks.length - 1]).n;
  calWeek = Math.min(N, Math.max(1, Math.floor((Date.now() - START) / WEEK) + 1));

  const skills = [...new Set(weeks.flatMap(w => w.skills || []))].sort();
  $("skill").innerHTML = `<option value="">All skills</option>` + skills.map(s => `<option>${esc(s)}</option>`).join("");

  const ago = rel(Date.parse(data.synced_at));
  $("synced").innerHTML = data.synced_at ? `Updated from Notion <b>${ago}</b>, syncs daily at 5 PM ET` : "Synced from Notion";
  $("source").href = data.source || PAGE_LINK;
}

function rel(ms) {
  if (!ms) return "recently";
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + " min ago";
  const h = Math.round(m / 60);
  if (h < 48) return h + (h === 1 ? " hour ago" : " hours ago");
  return fmt(ms, true);
}

const matches = w => {
  if (filters.status && sKey(w.status) !== filters.status && !(filters.status === "todo" && sKey(w.status) === "block")) return false;
  if (filters.skill && !(w.skills || []).includes(filters.skill)) return false;
  if (filters.q) {
    const q = filters.q.toLowerCase();
    if (!(w.title.toLowerCase().includes(q) || (w.skills || []).some(s => s.toLowerCase().includes(q)) || (w.notes || "").toLowerCase().includes(q) || w.phase.name.toLowerCase().includes(q))) return false;
  }
  return true;
};
const filtering = () => !!(filters.q || filters.skill || filters.status);

/* ---------------- geometry ---------------- */
const ease = t => 0.12 * t + 0.88 * (1 - Math.cos(Math.PI * t)) / 2;
const cAt = wk => ease(Math.min(1, Math.max(0, wk / N)));
const wkOfDate = ms => (ms - START) / WEEK;

function makeGeo() {
  const W = Math.max(300, wrapEl.clientWidth);
  const H = Math.round(Math.min(600, Math.max(360, W * 0.58)));
  const L = 46, R = W - 16, T = 46, B = H - 62;
  const span = view.b - view.a;
  const ca = cAt(view.a), cb = cAt(view.b), cs = Math.max(cb - ca, 1e-3);
  const lo = ca - 0.08 * cs, hi = cb + 0.14 * cs;
  const x = wk => L + (wk - view.a) / span * (R - L);
  const y = c => B - (c - lo) / (hi - lo) * (B - T);
  const pt = wk => [x(wk), y(cAt(wk))];
  const wkAtX = px => view.a + (px - L) / (R - L) * span;
  return { W, H, L, R, T, B, span, x, y, pt, wkAtX };
}

/* ---------------- svg helpers ---------------- */
function el(tag, attrs, parent, text) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
}
const ctx = document.createElement("canvas").getContext("2d");
function textW(s, size, weight) { ctx.font = `${weight || 500} ${size}px "Instrument Sans", "Helvetica Neue", Arial, sans-serif`; return ctx.measureText(s).width; }
function fitText(s, size, weight, max) {
  if (textW(s, size, weight) <= max) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; textW(s.slice(0, m) + "…", size, weight) <= max ? lo = m : hi = m - 1; }
  return s.slice(0, Math.max(1, lo)).trimEnd() + "…";
}
function hit(g, label, onSelect, tipHtml) {
  g.setAttribute("class", "hit");
  g.setAttribute("tabindex", "0");
  g.setAttribute("role", "button");
  g.setAttribute("aria-label", label);
  g.addEventListener("click", e => { if (dragged) return; e.stopPropagation(); onSelect(); });
  g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } });
  if (tipHtml) {
    g.addEventListener("pointerenter", e => { if (e.pointerType === "mouse" && !panState) showTip(tipHtml, g); });
    g.addEventListener("pointerleave", hideTip);
    g.addEventListener("focus", () => showTip(tipHtml, g));
    g.addEventListener("blur", hideTip);
  }
}
function showTip(html, g) {
  tip.innerHTML = html; tip.hidden = false;
  const b = g.getBoundingClientRect(), w = wrapEl.getBoundingClientRect();
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let left = b.left - w.left + b.width / 2 - tw / 2, top = b.top - w.top - th - 8;
  if (top < 4) top = b.bottom - w.top + 8;
  left = Math.max(6, Math.min(w.width - tw - 6, left));
  tip.style.left = left + "px"; tip.style.top = top + "px";
}
function hideTip() { tip.hidden = true; }

/* ---------------- chart ---------------- */
function render() {
  geo = makeGeo();
  const { W, H, L, R, T, B, span, x, y, pt } = geo;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("height", H);
  svg.innerHTML = "";
  hideTip();
  const inView = wk => wk >= view.a - 0.01 && wk <= view.b + 0.01;
  const weekMode = span <= 13.5;

  const defs = el("defs", {}, svg);
  const clip = el("clipPath", { id: "plot" }, defs);
  el("rect", { x: L, y: 0, width: R - L, height: B + 2 }, clip);

  // grid
  const grid = el("g", {}, svg);
  for (let gx = L; gx <= R; gx += 32) el("line", { x1: gx, y1: 12, x2: gx, y2: B, stroke: "var(--grid)" }, grid);
  for (let gy = B; gy >= 12; gy -= 32) el("line", { x1: L, y1: gy, x2: R, y2: gy, stroke: "var(--grid)" }, grid);

  // month highlight
  if (sel.kind === "month") {
    const a = Math.max(L, x(wkOfDate(Date.UTC(sel.y, sel.m, 1)))), b = Math.min(R, x(wkOfDate(Date.UTC(sel.y, sel.m + 1, 1))));
    if (b > a) el("rect", { x: a, y: 12, width: b - a, height: B - 12, fill: "var(--accent-soft)", opacity: 0.75 }, svg);
  }
  // phase band when a phase is selected
  if (sel.kind === "phase") {
    const p = PHASES[sel.n - 1];
    const a = Math.max(L, x(p.w[0] - 1)), b = Math.min(R, x(p.w[1]));
    if (b > a) el("rect", { x: a, y: 12, width: b - a, height: B - 12, fill: "var(--accent-soft)", opacity: 0.55 }, svg);
  }

  // axes
  el("line", { x1: L, y1: B, x2: R, y2: B, stroke: "var(--muted)", "stroke-width": 2 }, svg);
  el("line", { x1: L, y1: B, x2: L, y2: 14, stroke: "var(--muted)", "stroke-width": 2 }, svg);
  el("path", { d: `M${L - 6} 25 L${L} 13 L${L + 6} 25`, fill: "none", stroke: "var(--muted)", "stroke-width": 2 }, svg);
  el("text", { transform: `translate(${L - 22} ${(T + B) / 2}) rotate(-90)`, "text-anchor": "middle", "font-size": 12, "font-weight": 700, "letter-spacing": 2.4, fill: "var(--muted)" }, svg, "SKILL LEVEL");

  // today
  const tw = wkOfDate(Date.now());
  if (tw > 0 && tw < N && inView(tw)) {
    const tx = x(tw);
    el("line", { x1: tx, y1: 20, x2: tx, y2: B, stroke: "var(--ink)", "stroke-width": 1.5, "stroke-dasharray": "3 5", opacity: 0.45 }, svg);
    el("text", { x: tx, y: 16, "text-anchor": tx > R - 60 ? "end" : "middle", "font-size": 12, "font-weight": 700, fill: "var(--muted)" }, svg, "Today, " + fmt(Date.now()));
  }

  // curve
  const cg = el("g", { "clip-path": "url(#plot)" }, svg);
  const path = (a, b) => {
    a = Math.max(0, a); b = Math.min(N, b);
    if (b <= a) return "";
    let d = ""; const steps = 140;
    for (let k = 0; k <= steps; k++) { const [px, py] = pt(a + (b - a) * k / steps); d += (k ? "L" : "M") + px.toFixed(1) + " " + py.toFixed(1); }
    return d;
  };
  const split = activeWeek - 0.5;
  el("path", { d: path(Math.max(split, view.a - 1), view.b + 1), fill: "none", stroke: "var(--muted)", "stroke-width": 3, "stroke-dasharray": "2 9", "stroke-linecap": "round", opacity: 0.75 }, cg);
  el("path", { d: path(view.a - 1, Math.min(split, view.b + 1)), fill: "none", stroke: "var(--accent)", "stroke-width": 6, "stroke-linecap": "round" }, cg);

  // event marks on the axis
  events.forEach(ev => {
    const wk = wkOfDate(ev.date);
    if (!inView(wk)) return;
    const g = el("g", {}, svg);
    el("circle", { cx: x(wk), cy: B, r: 10, fill: "transparent" }, g);
    el("circle", { cx: x(wk), cy: B, r: ev.cert ? 5 : 4, class: "ring", fill: isDone(ev.status) ? "var(--accent)" : "var(--surface)", stroke: ev.cert ? "var(--accent)" : "var(--muted)", "stroke-width": 2 }, g);
    const d = new Date(ev.date);
    hit(g, `${ev.title}, ${fmt(ev.date, true)}`, () => select({ kind: "month", y: d.getUTCFullYear(), m: d.getUTCMonth() }),
      `<b>${esc(ev.title)}</b>${fmt(ev.date, true)}, ${esc(ev.status)}`);
  });

  // labels (collision aware)
  const placed = [];
  const free = r => r.x >= L + 4 && r.x + r.w <= R - 2 && r.y >= 8 && r.y + r.h <= B - 4 &&
    !placed.some(o => r.x < o.x + o.w + 4 && r.x + r.w + 4 > o.x && r.y < o.y + o.h + 3 && r.y + r.h + 3 > o.y);
  const reserve = (cx, cy, rad) => placed.push({ x: cx - rad, y: cy - rad, w: rad * 2, h: rad * 2 });
  const labels = el("g", {}, svg);
  function pill(px, py, num, text, o) {
    const fs = o.fs || 15, h = fs + 17, gap = o.gap || 22;
    const nw = textW(num, fs - 2, 500), maxT = Math.max(60, o.max || 260);
    const t = fitText(text, fs, o.bold ? 700 : 500, maxT);
    const w = 12 + nw + 15 + textW(t, fs, o.bold ? 700 : 500) + 13;
    const cands = [[-1, 0], [1, 0], [-1, -1], [1, -1], [1, 1], [-1, 1], [1, -2], [-1, -2]];
    let r = null;
    for (const [sx, sy] of (o.sideOnly ? cands.slice(0, 2) : cands)) {
      const c = { x: sx < 0 ? px - gap - w : px + gap * (sy ? 0.6 : 1), y: py - h / 2 + sy * (h + 8), w, h };
      if (sy && sx < 0) c.x = px - gap * 0.6 - w;
      if (free(c)) { r = c; break; }
    }
    if (!r) return false;
    placed.push(r);
    const g = el("g", {}, labels);
    const cy = r.y + h / 2, lx = r.x < px ? r.x + w : r.x;
    el("line", { x1: lx, y1: cy, x2: px, y2: py, stroke: o.line, "stroke-width": 2 }, g);
    el("rect", { x: r.x, y: r.y, width: w, height: h, rx: 7, class: "ring", fill: o.fill, stroke: o.stroke, "stroke-width": 1.5 }, g);
    el("text", { x: r.x + 12, y: cy + fs * 0.35, "font-size": fs - 2, fill: "var(--muted)" }, g, num);
    el("line", { x1: r.x + 12 + nw + 7.5, y1: cy - h / 2 + 7, x2: r.x + 12 + nw + 7.5, y2: cy + h / 2 - 7, stroke: "var(--line)", "stroke-width": 1.5 }, g);
    el("text", { x: r.x + 12 + nw + 15, y: cy + fs * 0.36, "font-size": fs, "font-weight": o.bold ? 700 : 500, fill: "var(--ink)" }, g, t);
    if (o.opacity != null) g.setAttribute("opacity", o.opacity);
    hit(g, o.aria, o.onSelect, o.tip);
    return true;
  }

  // reserve space for dots and the avatar first so labels avoid them
  const pxw = (R - L) / span, dotR = Math.max(3.2, Math.min(9, pxw * 0.3));
  const compact = W < 640;
  weeks.forEach(w => {
    const c = w.n - 0.5; if (!inView(c)) return;
    const [px, py] = pt(c);
    if (w.n === activeWeek) reserve(px, py, 26); else if (weekMode) reserve(px, py, dotR + 3);
  });

  if (weekMode) {
    // phase context in the corner
    const mid = (view.a + view.b) / 2;
    const ph = PHASES.find(p => mid >= p.w[0] - 1 && mid <= p.w[1]) || PHASES[0];
    const label = fitText(`Phase ${ph.n}: ${compact ? ph.short : ph.name}`, 13, 700, (R - L) * 0.9 - 130);
    el("text", { x: L + 14, y: T - 14, "font-size": 13, "font-weight": 700, fill: "var(--accent)" }, svg, label);
    placed.push({ x: L, y: T - 32, w: textW(label, 13, 700) + 30, h: 26 });
    const maxW = compact ? R - L - 40 : Math.min(340, (R - L) * 0.62);
    if (compact) {
      // small screens: full label for the selected week only, week numbers for the rest
      weeks.forEach(w => {
        const c = w.n - 0.5; if (!inView(c) || w.n === activeWeek) return;
        const on = sel.kind === "week" && sel.n === w.n;
        const [px, py] = pt(c), t = "W" + pad(w.n), tw2 = textW(t, 12, 700);
        const r = { x: px - tw2 / 2, y: py + dotR + 8, w: tw2, h: 14 };
        if (!free(r)) { r.y = py - dotR - 22; if (!free(r)) return; }
        placed.push(r);
        el("text", { x: px, y: r.y + 11, "text-anchor": "middle", "font-size": on ? 13 : 12, "font-weight": on ? 800 : 700, fill: on ? "var(--accent)" : "var(--muted)",
          opacity: filtering() && !matches(w) ? 0.3 : 1 }, labels, t);
      });
    }
    // place the selected week first so it always gets a full label
    const order = weeks.filter(w => inView(w.n - 0.5)).sort((p, q) => (q.n === sel.n && sel.kind === "week") - (p.n === sel.n && sel.kind === "week") || p.n - q.n);
    order.forEach(w => {
      if (compact) return;
      const [px, py] = pt(w.n - 0.5);
      const k = sKey(w.status), on = sel.kind === "week" && sel.n === w.n;
      pill(px, py, "W" + pad(w.n), w.title, {
        fs: 14, gap: w.n === activeWeek ? 30 : 18, max: on ? maxW : maxW * 0.7, bold: on || k !== "todo",
        fill: on ? "var(--accent-soft)" : k === "done" ? "var(--accent-soft)" : k === "now" ? "var(--go-soft)" : "var(--surface)",
        stroke: on ? "var(--accent)" : k === "now" ? "var(--go)" : "var(--line)",
        line: k === "done" ? "var(--accent)" : k === "now" ? "var(--go)" : "var(--idle)",
        opacity: filtering() && !matches(w) ? 0.25 : null,
        aria: `Week ${w.n}: ${w.title}`, onSelect: () => select({ kind: "week", n: w.n }),
        tip: `<b>W${pad(w.n)} ${esc(w.title)}</b>${fmt(w.startMs)}, ${esc(w.status)}`
      });
    });
  } else {
    PHASES.forEach(p => {
      if (!inView(p.w[1])) return;
      const [px, py] = pt(p.w[1]);
      const ws = weeks.filter(w => w.phase === p);
      const done = ws.length && ws.every(w => isDone(w.status)), active = ws.some(w => w.status === "In progress") || (ws.some(w => isDone(w.status)) && !done);
      const on = (sel.kind === "phase" && sel.n === p.n) || (sel.kind === "week" && weeks[sel.n - 1] && weeks[sel.n - 1].phase === p);
      const ok = pill(px, py, pad(p.n), p.short, {
        fs: W < 520 ? 13 : 15, gap: 24, max: 220, sideOnly: true, bold: on || active || done,
        fill: on ? "var(--accent-soft)" : active ? "var(--go-soft)" : "var(--surface)",
        stroke: on ? "var(--accent)" : active ? "var(--go)" : "var(--line)",
        line: done ? "var(--accent)" : active ? "var(--go)" : "var(--idle)",
        aria: `Phase ${p.n}: ${p.name}`, onSelect: () => select({ kind: "phase", n: p.n }),
        tip: `<b>Phase ${p.n}: ${esc(p.name)}</b>Weeks ${p.w[0]} to ${p.w[1]}`
      });
      if (!ok) {
        // too crowded for a label: a small numbered badge above the checkpoint
        const g = el("g", {}, labels);
        el("circle", { cx: px - 14, cy: py - 16, r: 11, class: "ring", fill: on ? "var(--accent)" : "var(--surface)", stroke: "var(--accent)", "stroke-width": 1.5 }, g);
        el("text", { x: px - 14, y: py - 12, "text-anchor": "middle", "font-size": 11, "font-weight": 700, fill: on ? "var(--surface)" : "var(--accent)" }, g, p.n);
        hit(g, `Phase ${p.n}: ${p.name}`, () => select({ kind: "phase", n: p.n }), `<b>Phase ${p.n}: ${esc(p.name)}</b>Weeks ${p.w[0]} to ${p.w[1]}`);
      }
    });
  }

  // checkpoint diamonds
  PHASES.forEach(p => {
    if (!inView(p.w[1])) return;
    const [px, py] = pt(p.w[1]);
    const cp = checkpoints[p.n];
    const g = el("g", {}, svg);
    el("rect", { x: px - 6, y: py - 6, width: 12, height: 12, transform: `rotate(45 ${px} ${py})`, class: "ring",
      fill: cp && isDone(cp.status) ? "var(--accent)" : "var(--surface)", stroke: "var(--accent)", "stroke-width": 2 }, g);
    hit(g, `Phase ${p.n} checkpoint`, () => select({ kind: "phase", n: p.n }),
      `<b>${esc(cp ? cp.task.replace(/^[^\w]+/, "") : "Phase " + p.n + " checkpoint")}</b>${cp ? fmt(parseDate(cp.start), true) + ", " + esc(cp.status) : ""}`);
  });

  // week dots
  weeks.forEach(w => {
    const c = w.n - 0.5;
    if (!inView(c)) return;
    const [px, py] = pt(c);
    const k = sKey(w.status), on = sel.kind === "week" && sel.n === w.n;
    const inMonth = sel.kind === "month" && new Date(w.startMs).getUTCMonth() === sel.m && new Date(w.startMs).getUTCFullYear() === sel.y;
    const dim = (filtering() && !matches(w)) || (sel.kind === "phase" && w.phase.n !== sel.n);
    const g = el("g", { opacity: dim ? 0.22 : 1 }, svg);
    el("circle", { cx: px, cy: py, r: Math.max(14, dotR + 6), fill: "transparent" }, g);
    if (w.n === activeWeek) {
      el("circle", { cx: px, cy: py, r: 23, class: "ring", fill: "var(--surface)", stroke: on ? "var(--ink)" : "var(--accent)", "stroke-width": 4 }, g);
      el("circle", { cx: px, cy: py, r: 17, fill: "var(--accent)" }, g);
      el("text", { x: px, y: py + 6.5, "text-anchor": "middle", "font-size": 18, "font-weight": 800, fill: "var(--surface)" }, g, "G");
    } else {
      el("circle", { cx: px, cy: py, r: on || inMonth ? dotR + 2 : dotR, class: "ring",
        fill: k === "done" ? "var(--accent)" : k === "now" ? "var(--go)" : k === "block" ? "var(--warn)" : on || inMonth ? "var(--accent-soft)" : "var(--bg)",
        stroke: on ? "var(--ink)" : inMonth || k !== "todo" ? "var(--accent)" : "var(--muted)", "stroke-width": on ? 3 : 2 }, g);
      if (w.n === calWeek) el("circle", { cx: px, cy: py, r: dotR + 5, fill: "none", stroke: "var(--ink)", "stroke-width": 1.5, "stroke-dasharray": "2 3" }, g);
    }
    hit(g, `Week ${w.n}: ${w.title}, ${w.status}`, () => select({ kind: "week", n: w.n }),
      `<b>W${pad(w.n)} ${esc(w.title)}</b>${fmt(w.startMs)} to ${fmt(w.startMs + 6 * DAY)}, ${esc(w.status)}${w.n === calWeek ? "<br>This week on the calendar" : ""}`);
  });

  svg.appendChild(labels); // labels sit above the dots

  // x axis
  const ax = el("g", {}, svg);
  if (span > 16) {
    let yy = new Date(START).getUTCFullYear(), mm = new Date(START).getUTCMonth();
    for (let i = 0; i < 16; i++) {
      const a0 = wkOfDate(Date.UTC(yy, mm, 1)), b0 = wkOfDate(Date.UTC(yy, mm + 1, 1));
      if (a0 > N) break;
      const a = Math.max(view.a, Math.max(0, a0)), b = Math.min(view.b, Math.min(N, b0));
      if (b > a) {
        if (a0 >= view.a && a0 > 0) el("line", { x1: x(a0), y1: B, x2: x(a0), y2: B + 6, stroke: "var(--muted)", "stroke-width": 1.5 }, ax);
        const cx = (x(a) + x(b)) / 2, bw = x(b) - x(a);
        if (bw >= 18) {
          const on = sel.kind === "month" && sel.y === yy && sel.m === mm;
          const g = el("g", {}, ax);
          el("rect", { x: cx - Math.min(30, bw / 2 - 2), y: B + 10, width: Math.min(60, bw - 4), height: 42, rx: 8, class: "ring",
            fill: on ? "var(--accent-soft)" : "transparent", stroke: on ? "var(--accent)" : "transparent", "stroke-width": 1.5 }, g);
          el("text", { x: cx, y: B + 30, "text-anchor": "middle", "font-size": 14, "font-weight": on ? 800 : 600, fill: on ? "var(--accent)" : "var(--ink)" }, g, bw >= 32 ? MON[mm] : MON[mm][0]);
          if (mm === 0 || i === 0) el("text", { x: cx, y: B + 46, "text-anchor": "middle", "font-size": 11, fill: "var(--muted)" }, g, "'" + String(yy).slice(2));
          const Y = yy, M = mm;
          hit(g, `${MON[M]} ${Y}`, () => { select({ kind: "month", y: Y, m: M }); zoomToMonth(Y, M); });
        }
      }
      mm++; if (mm > 11) { mm = 0; yy++; }
    }
  } else {
    weeks.forEach(w => {
      const a0 = w.n - 1;
      if (a0 + 1 < view.a || a0 > view.b) return;
      if (a0 >= view.a) el("line", { x1: x(a0), y1: B, x2: x(a0), y2: B + 6, stroke: "var(--muted)", "stroke-width": 1.5 }, ax);
      const cx = x(w.n - 0.5), bw = x(1) - x(0);
      if (cx < L + 10 || cx > R - 10 || bw < 34) return;
      const on = sel.kind === "week" && sel.n === w.n;
      const g = el("g", {}, ax);
      el("rect", { x: cx - Math.min(28, bw / 2 - 2), y: B + 8, width: Math.min(56, bw - 4), height: 44, rx: 8, class: "ring",
        fill: on ? "var(--accent-soft)" : "transparent", stroke: on ? "var(--accent)" : "transparent", "stroke-width": 1.5 }, g);
      el("text", { x: cx, y: B + 27, "text-anchor": "middle", "font-size": 13, "font-weight": on ? 800 : 700, fill: on ? "var(--accent)" : "var(--ink)" }, g, "W" + pad(w.n));
      if (bw >= 52) el("text", { x: cx, y: B + 44, "text-anchor": "middle", "font-size": 11, fill: "var(--muted)" }, g, fmt(w.startMs));
      hit(g, `Week ${w.n}`, () => select({ kind: "week", n: w.n }));
    });
  }

  // zoom badge
  const first = Math.max(1, Math.floor(view.a) + 1), last = Math.min(N, Math.ceil(view.b));
  const count = filtering() ? weeks.filter(matches).length : null;
  $("zoomBadge").textContent = (span >= N - 0.05 ? "Whole year" : `Weeks ${first} to ${last}`) + (count != null ? `, ${count} matching` : "");
  updateBrush();
}

/* ---------------- view changes ---------------- */
let anim = null;
function clampView(a, b) {
  let span = Math.min(N, Math.max(3, b - a));
  let c = (a + b) / 2;
  a = c - span / 2; b = c + span / 2;
  if (a < 0) { b -= a; a = 0; }
  if (b > N) { a -= b - N; b = N; }
  return { a: Math.max(0, a), b: Math.min(N, b) };
}
function setView(a, b, animate) {
  const target = clampView(a, b);
  if (anim) cancelAnimationFrame(anim);
  if (!animate || reduceMotion) { view = target; render(); return; }
  const from = { ...view }, t0 = performance.now(), dur = 320;
  const step = now => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    view = { a: from.a + (target.a - from.a) * e, b: from.b + (target.b - from.b) * e };
    render();
    if (k < 1) anim = requestAnimationFrame(step); else anim = null;
  };
  anim = requestAnimationFrame(step);
}
function zoomAt(factor, anchor, animate) {
  const span = view.b - view.a, ns = Math.min(N, Math.max(3, span * factor));
  if (anchor == null) anchor = (view.a + view.b) / 2;
  const a = anchor - (anchor - view.a) * (ns / span);
  setView(a, a + ns, animate);
}
const zoomToPhase = n => { const p = PHASES[n - 1]; setView(p.w[0] - 1 - 0.6, p.w[1] + 0.6, true); };
const zoomToWeek = n => setView(n - 0.5 - 4.5, n - 0.5 + 4.5, true);
function zoomToMonth(y, m) {
  const a = wkOfDate(Date.UTC(y, m, 1)), b = wkOfDate(Date.UTC(y, m + 1, 1));
  setView(a - 0.4, Math.max(b + 0.4, a + 5), true);
}
function ensureVisible(n) {
  const c = n - 0.5, span = view.b - view.a;
  if (c < view.a + 0.6 || c > view.b - 0.6) setView(c - span / 2, c + span / 2, true);
}

/* pan, pinch, wheel */
let panState = null, dragged = false;
const pointers = new Map();
svg.addEventListener("pointerdown", e => {
  if (e.button !== 0 && e.pointerType === "mouse") return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  dragged = false;
  const rect = svg.getBoundingClientRect();
  const toLocal = cx => (cx - rect.left) * (geo.W / rect.width);
  if (pointers.size === 1) {
    panState = { x0: e.clientX, y0: e.clientY, view0: { ...view }, toLocal, captured: false, id: e.pointerId };
  } else if (pointers.size === 2) {
    const [p1, p2] = [...pointers.values()];
    panState = { pinch: true, d0: Math.hypot(p1.x - p2.x, p1.y - p2.y), mid: toLocal((p1.x + p2.x) / 2), view0: { ...view }, toLocal };
    dragged = true;
    [...pointers.keys()].forEach(id => { try { svg.setPointerCapture(id); } catch (_) {} });
  }
});
svg.addEventListener("pointermove", e => {
  if (!pointers.has(e.pointerId) || !panState) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const g0 = geo;
  if (panState.pinch && pointers.size >= 2) {
    const [p1, p2] = [...pointers.values()];
    const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const v0 = panState.view0, span0 = v0.b - v0.a;
    const anchor = v0.a + (panState.mid - g0.L) / (g0.R - g0.L) * span0;
    const ns = Math.min(N, Math.max(3, span0 * panState.d0 / Math.max(d, 1)));
    const a = anchor - (anchor - v0.a) * (ns / span0);
    view = clampView(a, a + ns); render();
    return;
  }
  const dx = e.clientX - panState.x0, dy = e.clientY - panState.y0;
  if (!dragged) {
    if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) return;
    dragged = true; wrapEl.classList.add("panning"); hideTip();
    try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  }
  const rect = svg.getBoundingClientRect();
  const span = panState.view0.b - panState.view0.a;
  const dw = -dx * (g0.W / rect.width) / (g0.R - g0.L) * span;
  view = clampView(panState.view0.a + dw, panState.view0.b + dw); render();
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size === 0) { panState = null; wrapEl.classList.remove("panning"); setTimeout(() => { dragged = false; }, 0); }
  else if (pointers.size === 1 && panState && panState.pinch) {
    const [[id, p]] = [...pointers.entries()];
    panState = { x0: p.x, y0: p.y, view0: { ...view }, captured: true, id };
  }
}
svg.addEventListener("pointerup", endPointer);
svg.addEventListener("pointercancel", endPointer);
svg.addEventListener("click", e => { if (dragged) e.stopPropagation(); }, true);
svg.addEventListener("dblclick", e => {
  const rect = svg.getBoundingClientRect();
  zoomAt(0.5, geo.wkAtX((e.clientX - rect.left) * (geo.W / rect.width)), true);
});
wrapEl.addEventListener("wheel", e => {
  const rect = svg.getBoundingClientRect();
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    zoomAt(Math.exp(e.deltaY * 0.01), geo.wkAtX((e.clientX - rect.left) * (geo.W / rect.width)));
  } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    e.preventDefault();
    const span = view.b - view.a, dw = e.deltaX * (geo.W / rect.width) / (geo.R - geo.L) * span;
    view = clampView(view.a + dw, view.b + dw); render();
  }
}, { passive: false });

/* overview strip + brush */
const brush = $("brush"), segsEl = $("segs");
function updateBrush() {
  const full = view.b - view.a >= N - 0.05;
  brush.classList.toggle("full", full);
  brush.style.left = (view.a / N * 100) + "%";
  brush.style.width = ((view.b - view.a) / N * 100) + "%";
  brush.setAttribute("aria-valuetext", `Weeks ${Math.floor(view.a) + 1} to ${Math.ceil(view.b)}`);
}
let brushDrag = null;
brush.addEventListener("pointerdown", e => {
  const mode = e.target.classList.contains("l") ? "l" : e.target.classList.contains("r") ? "r" : "move";
  brushDrag = { mode, x0: e.clientX, v0: { ...view }, width: segsEl.getBoundingClientRect().width, moved: false };
  brush.setPointerCapture(e.pointerId);
  e.preventDefault();
});
brush.addEventListener("pointermove", e => {
  if (!brushDrag) return;
  const dw = (e.clientX - brushDrag.x0) / brushDrag.width * N, v0 = brushDrag.v0;
  if (Math.abs(e.clientX - brushDrag.x0) > 3) brushDrag.moved = true;
  if (brushDrag.mode === "move") view = clampView(v0.a + dw, v0.b + dw);
  else if (brushDrag.mode === "l") view = clampView(Math.min(v0.a + dw, v0.b - 3), v0.b);
  else view = clampView(v0.a, Math.max(v0.b + dw, v0.a + 3));
  render();
});
brush.addEventListener("pointerup", e => {
  if (brushDrag && !brushDrag.moved) {
    const r = segsEl.getBoundingClientRect();
    const n = Math.min(N, Math.max(1, Math.floor((e.clientX - r.left) / r.width * N) + 1));
    select({ kind: "week", n });
  }
  brushDrag = null;
});
brush.addEventListener("keydown", e => {
  const span = view.b - view.a;
  if (e.key === "ArrowLeft") { e.preventDefault(); setView(view.a - 1, view.b - 1); }
  if (e.key === "ArrowRight") { e.preventDefault(); setView(view.a + 1, view.b + 1); }
  if (e.key === "Home") { e.preventDefault(); setView(0, span); }
  if (e.key === "End") { e.preventDefault(); setView(N - span, N); }
});

function renderStrip() {
  segsEl.innerHTML = weeks.map(w => {
    const c = ["seg", { done: "done", now: "now", block: "block", todo: "" }[sKey(w.status)], w.n === calWeek ? "cal" : "",
      filtering() && !matches(w) ? "dim" : "", sel.kind === "week" && sel.n === w.n ? "sel" : ""].join(" ");
    return `<button type="button" class="${c}" data-w="${w.n}" aria-label="Week ${w.n}: ${esc(w.title)}, ${esc(w.status)}" title="W${pad(w.n)} ${esc(w.title)}"></button>`;
  }).join("");
  $("miniPhases").innerHTML = PHASES.map(p => {
    const on = (sel.kind === "phase" && sel.n === p.n) || (sel.kind === "week" && weeks[sel.n - 1] && weeks[sel.n - 1].phase === p);
    return `<button type="button" class="${on ? "on" : ""}" data-p="${p.n}" style="grid-column:${p.w[0]} / ${p.w[1] + 1}" title="Zoom to phase ${p.n}: ${esc(p.name)}">${p.n}. ${esc(p.short)}</button>`;
  }).join("");
}
segsEl.addEventListener("click", e => { const b = e.target.closest("[data-w]"); if (b) { select({ kind: "week", n: +b.dataset.w }); ensureVisible(+b.dataset.w); } });
$("miniPhases").addEventListener("click", e => { const b = e.target.closest("[data-p]"); if (b) { select({ kind: "phase", n: +b.dataset.p }); zoomToPhase(+b.dataset.p); } });

/* ---------------- detail card ---------------- */
const detail = $("detail");
const weekRow = w => `<li><button type="button" data-week="${w.n}"><span class="n">W${pad(w.n)}</span><span>${esc(w.title)}</span><span class="d">${sPill(w.status)}</span></button></li>`;
const hrs = v => v == null ? "Not logged" : v + " h";

function renderDetail() {
  let h = "";
  if (sel.kind === "week") {
    const w = weeks[sel.n - 1]; if (!w) return;
    const p = w.phase, threads = (w.skills || []).filter(s => s === "DSA" || s === "System Design");
    const where = [w.n === activeWeek ? "Where you are in Notion" : "", w.n === calWeek ? "This week on the calendar" : ""].filter(Boolean).join(". ");
    h = `<div class="eyebrow">Week ${pad(w.n)} / ${N}</div>
      <h2>${esc(w.title)}</h2>
      ${where ? `<p>${where}.</p>` : ""}
      <dl class="kv">
        <dt>Status</dt><dd>${sPill(w.status)}</dd>
        <dt>Dates</dt><dd>${fmt(w.startMs)} to ${fmt(w.startMs + 6 * DAY, true)}</dd>
        <dt>Phase</dt><dd><button class="chip" type="button" data-phase="${p.n}">${p.n}. ${esc(p.name)}</button></dd>
        <dt>Planned</dt><dd>${w.est != null ? w.est + " h" : "Not set"}</dd>
        <dt>Logged</dt><dd>${hrs(w.actual)}</dd>
        <dt>Confidence</dt><dd>${esc(w.confidence || "Not rated")}</dd>
      </dl>
      <div class="chips">${(w.skills || []).filter(s => !threads.includes(s)).map(s => `<button type="button" class="chip${filters.skill === s ? " on" : ""}" data-skill="${esc(s)}" title="Show every week with ${esc(s)}">${esc(s)}</button>`).join("")}</div>
      ${threads.length ? `<p>Weekly threads: ${threads.map(t => t === "DSA" ? "Python/DSA practice" : "system design reading").join(", ")}.</p>` : ""}
      ${w.notes ? `<p>${esc(w.notes)}</p>` : ""}
      <div class="actions">
        <button class="btn" type="button" data-step="-1" ${w.n === 1 ? "disabled" : ""}>Previous</button>
        <button class="btn" type="button" data-step="1" ${w.n === N ? "disabled" : ""}>Next</button>
        <button class="btn" type="button" data-zoomweek="${w.n}">Zoom here</button>
        <a class="btn primary" href="${notion(w.id)}" target="_blank" rel="noopener">Open checklist</a>
      </div>`;
  } else if (sel.kind === "phase") {
    const p = PHASES[sel.n - 1], ws = weeks.filter(w => w.phase === p);
    const done = ws.filter(w => isDone(w.status)).length;
    const planned = ws.reduce((a, w) => a + (w.est || 0), 0), logged = ws.reduce((a, w) => a + (w.actual || 0), 0);
    const pr = projects[p.n], cp = checkpoints[p.n];
    h = `<div class="eyebrow">Phase ${pad(p.n)} / 08</div>
      <h2>${esc(p.name)}</h2>
      <p>${esc(p.focus)}.</p>
      <dl class="kv">
        <dt>Weeks</dt><dd>${p.w[0]} to ${p.w[1]}, ${fmt(ws[0].startMs)} to ${fmt(ws[ws.length - 1].startMs + 6 * DAY, true)}</dd>
        <dt>Progress</dt><dd>${done} of ${ws.length} weeks done</dd>
        <dt>Hours</dt><dd>${logged} of ${planned} logged</dd>
        ${pr ? `<dt>Project</dt><dd>${esc(pr.title)} ${sPill(pr.status)}</dd>` : ""}
        ${cp ? `<dt>Checkpoint</dt><dd>${fmt(parseDate(cp.start))} ${sPill(cp.status)}</dd>` : ""}
      </dl>
      <ul class="list">${ws.map(weekRow).join("")}</ul>
      <div class="actions">
        <button class="btn" type="button" data-zoomphase="${p.n}">Zoom to phase</button>
        ${pr ? `<a class="btn primary" href="${notion(pr.id)}" target="_blank" rel="noopener">Open project</a>` : ""}
        ${cp ? `<a class="btn" href="${notion(cp.id)}" target="_blank" rel="noopener">Open checkpoint</a>` : ""}
      </div>`;
  } else if (sel.kind === "month") {
    const inM = ms => { const d = new Date(ms); return d.getUTCMonth() === sel.m && d.getUTCFullYear() === sel.y; };
    const ws = weeks.filter(w => inM(w.startMs));
    const evs = events.filter(e => inM(e.date)).concat(
      Object.values(checkpoints).filter(c => c.start && inM(parseDate(c.start))).map(c => ({ ...c, date: parseDate(c.start), title: c.task.replace(/^[^\w]+/, "") })))
      .sort((a, b) => a.date - b.date);
    const phases = [...new Set(ws.map(w => w.phase.short))];
    h = `<div class="eyebrow">${MON[sel.m]} ${sel.y}</div>
      <h2>${esc(phases.join(", then ") || "Wrap-up")}</h2>
      <p>${ws.length} week${ws.length === 1 ? "" : "s"} start this month, ${ws.reduce((a, w) => a + (w.est || 0), 0)} planned hours.</p>
      <ul class="list">${ws.map(weekRow).join("")}
        ${evs.map(e => `<li><a class="ev" href="${notion(e.id)}" target="_blank" rel="noopener"><span class="n">${fmt(e.date).split(" ")[1]}</span><span class="t">${esc(e.title)}</span><span class="d">${sPill(e.status)}</span></a></li>`).join("")}
      </ul>
      <div class="actions"><button class="btn" type="button" data-zoommonth="1">Zoom to ${MON[sel.m]}</button></div>`;
  }
  detail.innerHTML = h;
}
detail.addEventListener("click", e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.week) { select({ kind: "week", n: +t.dataset.week }); ensureVisible(+t.dataset.week); }
  else if (t.dataset.phase) select({ kind: "phase", n: +t.dataset.phase });
  else if (t.dataset.step) { const n = sel.n + +t.dataset.step; select({ kind: "week", n }); ensureVisible(n); }
  else if (t.dataset.zoomweek) zoomToWeek(+t.dataset.zoomweek);
  else if (t.dataset.zoomphase) zoomToPhase(+t.dataset.zoomphase);
  else if (t.dataset.zoommonth) zoomToMonth(sel.y, sel.m);
  else if (t.dataset.skill != null) { filters.skill = filters.skill === t.dataset.skill ? "" : t.dataset.skill; $("skill").value = filters.skill; refresh(); }
});

/* ---------------- tabs ---------------- */
function renderPane() {
  ["proj", "skills", "hours"].forEach(k => $("tab-" + k).setAttribute("aria-selected", String(k === tab)));
  const pane = $("pane");
  if (tab === "proj") {
    pane.innerHTML = `<ul class="proj">${PHASES.map(p => {
      const pr = projects[p.n], st = pr ? pr.status : "Not started", k = sKey(st);
      const bg = k === "done" ? "--accent-soft" : k === "now" ? "--go-soft" : "--bg", fg = k === "done" ? "--accent" : k === "now" ? "--go" : "--muted";
      return `<li><button type="button" data-phase="${p.n}">
        <span class="ic" style="background:var(${bg});color:var(${fg})">${pad(p.n)}</span>
        <span><span class="t">${esc(pr ? pr.title : p.short)}</span><br><span class="s">${esc(p.pdesc)}</span></span>
        ${sPill(st)}</button></li>`;
    }).join("")}</ul>`;
  } else if (tab === "skills") {
    const num = s => { const m = /(\d+)\s*%/.exec(s || ""); return m ? +m[1] : null; };
    pane.innerHTML = skillsTable.length ? `<div class="bars">${skillsTable.map(s => {
      const now = num(s.now), target = num(s.target);
      const pm = /Phase (\d)/.exec(s.covered || "");
      const fill = now != null ? now : /known|maintain/i.test(s.now + s.target) ? 100 : 0;
      return `<div class="bar-row"${pm ? ` role="button" tabindex="0" data-phase="${pm[1]}" style="cursor:pointer"` : ""} title="${esc(s.covered)}">
        <div class="top"><span>${esc(s.area)}</span><span>${esc(s.now)} now${target != null ? ", " + target + "% target" : ""}</span></div>
        <div class="track"><span class="fill" style="width:${fill}%"></span>${target != null ? `<span class="mark" style="left:${target}%"></span>` : ""}</div>
      </div>`;
    }).join("")}</div><p class="pane-note">Filled bar is where you are, the dark tick is the target. Update the percentages in Notion at each monthly check-in.</p>`
      : `<p class="pane-note" style="padding-top:16px">The skills table wasn't found on the Notion page.</p>`;
  } else {
    const rows = PHASES.map(p => {
      const ws = weeks.filter(w => w.phase === p);
      return { p, planned: ws.reduce((a, w) => a + (w.est || 0), 0), logged: ws.reduce((a, w) => a + (w.actual || 0), 0) };
    });
    const max = Math.max(...rows.map(r => r.planned), 1);
    const tp = rows.reduce((a, r) => a + r.planned, 0), tl = rows.reduce((a, r) => a + r.logged, 0);
    pane.innerHTML = `<div class="bars">${rows.map(r => `
      <div class="bar-row" role="button" tabindex="0" data-phase="${r.p.n}" style="cursor:pointer">
        <div class="top"><span>${r.p.n}. ${esc(r.p.short)}</span><span>${r.logged} of ${r.planned} h</span></div>
        <div class="track" style="width:${r.planned / max * 100}%"><span class="fill go" style="width:${Math.min(100, r.logged / Math.max(r.planned, 1) * 100)}%"></span></div>
      </div>`).join("")}</div><p class="pane-note">${tl} of ${tp} planned hours logged. Fill in Actual Hours on each week in Notion every Sunday.</p>`;
  }
}
document.querySelector(".tabs").addEventListener("click", e => {
  const b = e.target.closest("[role=tab]"); if (!b) return;
  tab = b.id.replace("tab-", ""); renderPane();
});
$("pane").addEventListener("click", e => {
  const t = e.target.closest("[data-phase]"); if (!t) return;
  select({ kind: "phase", n: +t.dataset.phase }); zoomToPhase(+t.dataset.phase);
});
$("pane").addEventListener("keydown", e => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const t = e.target.closest("[data-phase]"); if (!t) return;
  e.preventDefault(); select({ kind: "phase", n: +t.dataset.phase }); zoomToPhase(+t.dataset.phase);
});

/* ---------------- summary ---------------- */
function renderStats() {
  const done = weeks.filter(w => isDone(w.status)).length;
  const planned = weeks.reduce((a, w) => a + (w.est || 0), 0), logged = weeks.reduce((a, w) => a + (w.actual || 0), 0);
  const nextCp = Object.values(checkpoints).filter(c => !isDone(c.status) && c.start).sort((a, b) => a.start.localeCompare(b.start))[0];
  const gap = calWeek - activeWeek;
  $("stats").innerHTML = [
    ["W" + pad(activeWeek), "Current week in Notion"],
    [`${done} / ${N}`, "Weeks done"],
    [gap > 0 ? `${gap} wk` : "On pace", gap > 0 ? `Behind the calendar (W${pad(calWeek)})` : `Calendar is at W${pad(calWeek)}`],
    [`${logged} h`, `Logged of ${planned} planned`],
    [nextCp ? fmt(parseDate(nextCp.start)) : "None", "Next checkpoint"]
  ].map(([v, k]) => `<div class="stat"><span class="v">${v}</span><span class="k">${k}</span></div>`).join("");
}

/* ---------------- selection, filters, keys ---------------- */
function select(s) {
  if (s.kind === "week") s.n = Math.min(N, Math.max(1, s.n));
  sel = s;
  try {
    const hash = s.kind === "week" ? "w" + s.n : s.kind === "phase" ? "p" + s.n : `m${s.y}-${pad(s.m + 1)}`;
    history.replaceState(null, "", "#" + hash);
  } catch (_) {}
  refresh();
}
function refresh() { render(); renderDetail(); renderStrip(); }

let qTimer;
$("search").addEventListener("input", e => { clearTimeout(qTimer); qTimer = setTimeout(() => { filters.q = e.target.value.trim(); refresh(); }, 120); });
$("search").addEventListener("keydown", e => {
  if (e.key === "Enter") {
    filters.q = e.target.value.trim();
    const hitW = weeks.find(matches);
    if (hitW) { select({ kind: "week", n: hitW.n }); zoomToWeek(hitW.n); }
  } else if (e.key === "Escape") { e.target.value = ""; filters.q = ""; refresh(); }
});
$("skill").addEventListener("change", e => { filters.skill = e.target.value; refresh(); });
$("status").addEventListener("change", e => { filters.status = e.target.value; refresh(); });
$("zoomIn").addEventListener("click", () => zoomAt(0.6, sel.kind === "week" ? sel.n - 0.5 : null, true));
$("zoomOut").addEventListener("click", () => zoomAt(1 / 0.6, null, true));
$("fit").addEventListener("click", () => setView(0, N, true));
$("today").addEventListener("click", () => { select({ kind: "week", n: calWeek }); zoomToWeek(calWeek); });

document.addEventListener("keydown", e => {
  if (e.target.closest("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "+" || e.key === "=") { zoomAt(0.6, sel.kind === "week" ? sel.n - 0.5 : null, true); }
  else if (e.key === "-" || e.key === "_") { zoomAt(1 / 0.6, null, true); }
  else if (e.key === "0") { setView(0, N, true); }
  else if (e.key.toLowerCase() === "t") { select({ kind: "week", n: calWeek }); zoomToWeek(calWeek); }
  else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !e.target.closest("#brush")) {
    e.preventDefault();
    const base = sel.kind === "week" ? sel.n : activeWeek;
    const n = Math.min(N, Math.max(1, base + (e.key === "ArrowRight" ? 1 : -1)));
    select({ kind: "week", n }); ensureVisible(n);
  } else return;
});

function fromHash() {
  const h = location.hash.slice(1);
  let m;
  if ((m = /^w(\d+)$/.exec(h))) { sel = { kind: "week", n: +m[1] }; return () => zoomToWeek(+m[1]); }
  if ((m = /^p(\d)$/.exec(h))) { sel = { kind: "phase", n: +m[1] }; return () => zoomToPhase(+m[1]); }
  if ((m = /^m(\d{4})-(\d{2})$/.exec(h))) { sel = { kind: "month", y: +m[1], m: +m[2] - 1 }; return () => zoomToMonth(+m[1], +m[2] - 1); }
  return null;
}

/* ---------------- boot ---------------- */
async function boot() {
  try {
    const res = await fetch("data.json?v=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error(`data.json returned ${res.status}`);
    build(await res.json());
  } catch (err) {
    detail.innerHTML = `<div class="error"><b>Couldn't load the roadmap data.</b><br>${esc(err.message)}. Check that data.json is in the repo and the sync workflow has run.</div>`;
    $("synced").textContent = "Not synced yet";
    return;
  }
  sel = { kind: "week", n: activeWeek };
  const zoom = fromHash();
  view = { a: 0, b: N };
  if (!zoom && wrapEl.clientWidth < 640) { const p = weeks[activeWeek - 1].phase; view = clampView(p.w[0] - 1.6, p.w[1] + 0.6); }
  refresh(); renderPane(); renderStats();
  if (zoom) zoom();
  let lastW = wrapEl.clientWidth;
  new ResizeObserver(() => { if (wrapEl.clientWidth !== lastW) { lastW = wrapEl.clientWidth; render(); } }).observe(wrapEl);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => render());
}
boot();
})();
