// Shelf Awareness: an invite-only reading companion.
// Reading map · The story so far · The characters, with spoiler-safe progress per reader.
import { firebaseConfig, adminEmails } from "./firebase-config.js";

const $app = document.getElementById("app");
const params = new URLSearchParams(location.search);
const DEMO = params.has("demo");

// ---------- tiny helpers ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lower = (e) => (e || "").trim().toLowerCase();
let toastTimer;
function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.append(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2200);
}
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const ss = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
  del(k) { try { sessionStorage.removeItem(k); } catch {} },
};

// Invite code from ?invite=… survives the Google sign-in round trip.
if (params.get("invite")) {
  ss.set("sa-invite", params.get("invite"));
  history.replaceState(null, "", location.pathname + (DEMO ? "?demo" : "") + location.hash);
}

// ---------- state ----------
const S = {
  be: null, user: null, member: null, admin: false,
  seriesList: null, series: null, progress: null,
  q: "", justRevealed: null, error: "", sheet: null,
  assetsCache: {}, progressCache: {},
};

// ---------- routing ----------
function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "admin") return { view: "admin" };
  if (parts[0] === "s" && parts[1]) return { view: "series", sid: parts[1], section: parts[2] || "", book: parts[3] || "" };
  return { view: "library" };
}
const go = (h) => { if (location.hash !== h) location.hash = h; else render(); };

// ---------- boot ----------
async function boot() {
  try {
    if (DEMO) {
      const { createDemoBackend } = await import("./demo.js");
      S.be = createDemoBackend();
    } else {
      if (!firebaseConfig.apiKey) return renderGate("setup");
      const { createBackend } = await import("./fb.js");
      S.be = createBackend(firebaseConfig, adminEmails);
    }
  } catch (e) {
    console.error(e);
    return renderGate("error", "The library couldn't connect. Check your connection and reload.");
  }
  S.be.onAuth(async (user) => {
    S.user = user; S.member = null; S.admin = false; S.series = null; S.seriesList = null;
    if (!user) return renderGate("signin");
    $app.innerHTML = `<p class="loading">Checking the guest list…</p>`;
    try {
      S.member = await S.be.membership(user);
      const code = ss.get("sa-invite");
      if (!S.member && code) {
        try {
          await S.be.redeemInvite(code, user);
          ss.del("sa-invite");
          S.member = await S.be.membership(user);
          toast("Welcome to the library");
        } catch (e) {
          ss.del("sa-invite");
          return renderGate("not-invited", e.message || "That invite link didn't work.");
        }
      }
      if (!S.member) return renderGate("not-invited");
      S.admin = S.member.role === "admin";
      render();
    } catch (e) {
      console.error(e);
      renderGate("not-invited");
    }
  });
  window.addEventListener("hashchange", () => { S.q = ""; render(); });
}

// ---------- gates ----------
function renderGate(kind, msg = "") {
  const seal = `<img class="seal" src="assets/mystery-seal.webp" alt="">`;
  const title = `<h1>Shelf <span class="oct">Awareness</span></h1>`;
  let body = "";
  if (kind === "signin") {
    const invited = ss.get("sa-invite");
    body = `${seal}${title}
      <p>${invited ? "You've been invited. Sign in with Google to accept." : "A private reading companion. Sign in to open the library."}</p>
      <button class="btn" data-act="signin">Sign in with Google</button>`;
  } else if (kind === "not-invited") {
    body = `${seal}${title}
      ${msg ? `<div class="notice err">${esc(msg)}</div>` : ""}
      <p>You're signed in as <b>${esc(S.user?.email)}</b>, but this library is invite-only.</p>
      <p>Ask the librarian for an invite link, then open it on this device.</p>
      <button class="btn ghost" data-act="signout">Sign out</button>`;
  } else if (kind === "setup") {
    body = `${seal}${title}
      <p>Almost there. Add your Firebase web-app settings to <code>js/firebase-config.js</code>, push, and reload.</p>
      <p><a href="?demo">Open the local preview</a> (only works on your own computer).</p>`;
  } else {
    body = `${seal}${title}<div class="notice err">${esc(msg)}</div>`;
  }
  $app.innerHTML = `<div class="gate"><div class="box">${body}</div></div>`;
}

// ---------- shared chrome ----------
function topbar() {
  const u = S.user;
  return `<div class="topbar">
    <a class="brand" href="#/"><b>Shelf Awareness</b><span>Library</span></a>
    <div class="who-am-i">
      ${u.photo ? `<img src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">` : ""}
      <span>${esc(u.name)}</span>
      ${S.admin ? `<a class="linkbtn" href="#/admin">Librarian's desk</a>` : ""}
      <button class="linkbtn" data-act="signout">Sign out</button>
    </div>
  </div>`;
}
const footer = (extra = "") => `<footer><span>Shelf Awareness · a private reading companion${DEMO ? " · preview mode" : ""}</span><span class="mono">${extra}</span></footer>`;

// ---------- render dispatcher ----------
async function render() {
  if (!S.user || !S.member) return;
  const r = route();
  try {
    if (r.view === "admin" && S.admin) return await renderAdmin();
    if (r.view === "series") return await renderSeries(r);
    return await renderLibrary();
  } catch (e) {
    console.error(e);
    $app.innerHTML = topbar() + `<div class="notice err">Something went wrong loading this page. ${esc(e.message || "")}</div>`;
  }
}

// ---------- library ----------
async function renderLibrary() {
  if (!S.seriesList) {
    $app.innerHTML = topbar() + `<p class="loading">Dusting the shelves…</p>`;
    S.seriesList = await S.be.listSeries();
  }
  const list = S.seriesList;
  const cards = await Promise.all(list.map(async (s) => {
    const [assets, prog] = await Promise.all([seriesAssets(s.id), progressFor(s.id)]);
    const fin = (prog?.finished || []).length;
    const total = Object.keys(s.books || {}).length;
    const cur = prog?.current && s.books?.[prog.current]?.title;
    return `<a class="lib-card" href="#/s/${esc(s.id)}">
      ${assets?.banner ? `<img src="${assets.banner}" alt="">` : ""}
      <div><h2>${esc(s.title)}</h2><div class="meta">${esc(s.subtitle || "")}</div></div>
      <div class="meta">${cur ? `Reading <b>${esc(cur)}</b> · ` : ""}${fin} of ${total} read</div>
    </a>`;
  }));
  $app.innerHTML = topbar() + `
    <div class="section-h"><h2>Your shelves</h2><span class="eyebrow">${list.length} series</span></div>
    ${list.length ? `<div class="lib">${cards.join("")}</div>` :
      `<div class="start"><h3>The shelves are empty</h3><p>${S.admin ? "Upload a series bundle from the Librarian's desk." : "The librarian hasn't added any series yet."}</p></div>`}
    ${footer()}`;
}
async function seriesAssets(id) {
  if (S.assetsCache[id] !== undefined) return S.assetsCache[id];
  if (S.be.kind === "demo") { const s = await S.be.loadSeries(id); return (S.assetsCache[id] = s?.assets || null); }
  return (S.assetsCache[id] = await S.be.getAssets?.(id) ?? null);
}
async function progressFor(id) {
  if (S.progressCache[id] !== undefined) return S.progressCache[id];
  return (S.progressCache[id] = await S.be.getProgress(S.user.uid, id));
}

// ---------- series model ----------
function prepSeries(s, prog) {
  const order = [];
  (s.groups || []).forEach((g) => { g.books.forEach((b) => order.push(b)); (g.side || []).forEach((x) => order.push(x.book)); });
  Object.keys(s.books || {}).forEach((b) => { if (!order.includes(b)) order.push(b); });
  s._order = order; s._idx = Object.fromEntries(order.map((b, i) => [b, i]));
  s.characters = s.characters || []; s.summaries = s.summaries || {}; s.assets = s.assets || {};
  S.series = s;
  S.progress = {
    finished: new Set(prog?.finished || []),
    current: prog?.current || null,
    revealed: new Set(prog?.revealed || []),
  };
}
const P = () => S.progress;
const bookOf = (id) => S.series.books[id] || { title: id, type: "n" };
const shortOf = (id) => bookOf(id).short || bookOf(id).title.split(/\s+/).filter((w) => /^[A-Z0-9]/.test(w)).map((w) => w[0]).join("").slice(0, 4) || "?";
const bstate = (id) => (P().finished.has(id) ? "done" : P().current === id ? "now" : "todo");
const seen = (b) => P().finished.has(b) || P().current === b;
const known = (c) => c.books.some(seen);
const isNew = (c) => !!P().current && c.books.includes(P().current) && !c.books.some((b) => P().finished.has(b));
const veiled = (c) => isNew(c) && !P().revealed.has(c.id);
const firstMet = (c) => c.books.find(seen);
function catNo(c) {
  const f = firstMet(c);
  const n = S.series.characters.filter((x) => known(x) && firstMet(x) === f).indexOf(c) + 1;
  return `${shortOf(f)}·${String(n).padStart(2, "0")}`;
}

let saveTimer;
function saveProgress() {
  S.progressCache[S.series.id] = { finished: [...P().finished], current: P().current, revealed: [...P().revealed] };
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await S.be.saveProgress(S.user.uid, S.series.id, S.progressCache[S.series.id]); }
    catch (e) { console.error(e); toast("Couldn't save. Check your connection."); }
  }, 500);
}

// ---------- thumbnails ----------
const G = {
  magic: '<path d="M12 3l2.2 5.6 6 .4-4.6 3.8 1.5 5.9L12 15.5 6.9 18.7l1.5-5.9L3.8 9l6-.4z"/>',
  sword: '<path d="M18.5 3.5l2 2-9.3 9.3-2-2z"/><path d="M6 13.5l4.5 4.5M4.5 15.5l4 4M3.5 20.5l2.5-2.5"/>',
  divine: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  demon: '<path d="M12 21c-4 0-6.5-2.7-6.5-6.2 0-3.4 2.6-5.3 3.6-8.3 1.9 1.4 2.4 3.2 2.3 4.6 1.2-1 1.8-3.3 1.6-6.1 3.4 2.2 5.5 5.9 5.5 9.8 0 3.5-2.5 6.2-6.5 6.2z"/>',
  crown: '<path d="M3.5 18h17l-1.2-10-4.3 4-3-6.5-3 6.5-4.3-4z"/><path d="M3.5 21h17"/>',
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M17.5 12v3.5M20.5 12v2.5"/>',
  paw: '<ellipse cx="12" cy="16" rx="4.2" ry="3.5"/><circle cx="6" cy="10.5" r="1.8"/><circle cx="9.6" cy="6.8" r="1.8"/><circle cx="14.4" cy="6.8" r="1.8"/><circle cx="18" cy="10.5" r="1.8"/>',
  book: '<path d="M3.5 5.5c3-1 6-1 8.5.8 2.5-1.8 5.5-1.8 8.5-.8v13c-3-1-6-1-8.5.8-2.5-1.8-5.5-1.8-8.5-.8z"/><path d="M12 6.3v13"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  mask: '<path d="M4 6c5 1.5 11 1.5 16 0 0 7-2.8 12-8 12S4 13 4 6z"/><path d="M8 11c.8-.8 2-.8 2.8 0M13.2 11c.8-.8 2-.8 2.8 0M9 14.5c1.8 1.5 4.2 1.5 6 0"/>',
};
const initials = (n) => n.replace(/^(The|Mr|Mrs|Lord|Dame)\s+/, "").split(/[\s&]+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join("");
function thumb(c) {
  const k = (S.series._idx[firstMet(c)] ?? 0) % 6;
  if (c.portrait) return `<div class="thumb photo" aria-hidden="true"><img src="${c.portrait}" alt="" loading="lazy"></div>`;
  return `<div class="thumb b${k}" aria-hidden="true"><svg viewBox="0 0 24 24" class="glyph">${G[c.kind] || G.compass}</svg><span class="ini">${esc(initials(c.name))}</span></div>`;
}

// ---------- series page ----------
async function renderSeries(r) {
  if (!S.series || S.series.id !== r.sid) {
    $app.innerHTML = topbar() + `<p class="loading">Fetching the books…</p>`;
    const [s, prog] = await Promise.all([S.be.loadSeries(r.sid), progressFor(r.sid)]);
    if (!s) { $app.innerHTML = topbar() + `<div class="notice err">That series isn't on the shelves.</div>`; return; }
    prepSeries(s, prog);
  }
  const s = S.series;
  const known0 = s.characters.some(known);
  const section = r.section || ls.get(`sa-section-${s.id}`) || (known0 ? "chars" : "map");
  ls.set(`sa-section-${s.id}`, section);
  const base = `#/s/${encodeURIComponent(s.id)}`;

  const cur = P().current;
  const news = s.characters.filter(isNew);
  const met = news.filter((c) => P().revealed.has(c.id)).length;
  const head = `<header class="top">
    <div class="scroll" style="flex-basis:100%">
      ${s.assets.banner ? `<img src="${s.assets.banner}" alt="">` : ""}
      <div class="scroll-title"${s.assets.banner ? "" : ' style="position:static;transform:none;width:auto"'}><div class="eyebrow">${esc(s.tagline || s.subtitle || "")}</div>
      <h1>${esc(s.title)} <span class="oct">Who's Who</span></h1></div>
    </div>
    <div><p class="lede">The map of every book, the story so far, and everyone you've met. New faces in the book you're reading stay greyed out until you tap them.</p></div>
    <div class="now" aria-live="polite">
      <span class="eyebrow">Reading now</span>
      ${cur ? `<span class="t">${esc(bookOf(cur).title)}</span>
        <div class="bar"><i style="width:${news.length ? (met / news.length) * 100 : 0}%"></i></div>
        <span class="p">${met} of ${news.length} new characters met</span>`
      : `<span class="t">Nothing yet</span><span class="p">Pick a book on the reading map</span>`}
    </div>
  </header>
  <nav class="sections" aria-label="Sections">
    ${[["map", "I", "Reading map"], ["story", "II", "The story so far"], ["chars", "III", "The characters"]].map(([k, n, label]) =>
      `<button type="button" data-act="section" data-v="${k}" aria-pressed="${section === k}"><span class="k">${n}</span>${label}</button>`).join("")}
  </nav>`;

  let body = "";
  if (section === "map") body = mapHTML();
  else if (section === "story") body = storyHTML();
  else body = charsHTML(r.book, base);

  $app.innerHTML = topbar() + head + body + footer(`${s.characters.filter(known).length} characters met · ${P().finished.size} books read`);
  if (S.sheet) openSheet(S.sheet, true);
  if (S.justRevealed) {
    const el = $app.querySelector(`[data-id="${CSS.escape(S.justRevealed)}"]`);
    if (el) { el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true }); }
    S.justRevealed = null;
  }
  const q = document.getElementById("q");
  if (q && S.q) { q.value = S.q; q.focus(); q.setSelectionRange(S.q.length, S.q.length); }
}

// ---------- I. reading map ----------
function mapHTML() {
  const s = S.series;
  const all = s._order;
  const done = all.filter((b) => P().finished.has(b)).length;
  const seal = (k) => `<img src="assets/seal-${esc(k)}.webp" alt="" onerror="this.replaceWith(Object.assign(document.createElement('i'),{className:'sw t-${esc(k)}'}))">`;
  const chip = (b, note) => {
    const st = bstate(b), bk = bookOf(b);
    const label = st === "done" ? "Read" : st === "now" ? "Reading now" : "To read";
    return `<button type="button" class="bk t-${esc(bk.type)} ${st}" data-act="book" data-book="${esc(b)}" title="${esc((s.types?.[bk.type]?.label || "") + " · " + label)}">
      <span class="bk-t">${esc(bk.title)}</span><span class="bk-s">${esc(note || label)}</span></button>`;
  };
  let h = `<div class="section-h"><h2>Reading map</h2><span class="eyebrow">${done} of ${all.length} read · tap a book to update it</span></div>
    <div class="legend">${Object.entries(s.types || {}).map(([k, v]) => `<span>${seal(k)}${esc(v.label)}</span>`).join("")}</div><div class="map">`;
  (s.groups || []).forEach((g) => {
    const n = g.books.filter((b) => P().finished.has(b)).length;
    const crest = s.assets.crests?.[g.id];
    h += `<section class="series"><div class="ser-h">${crest ? `<img class="crest" src="${crest}" alt="">` : ""}<h3>${esc(g.name)}</h3><span class="eyebrow">${n} / ${g.books.length}</span></div>
      <div class="track-wrap"><ol class="track">${g.books.map((b) => `<li>${chip(b)}</li>`).join("")}</ol></div>
      ${g.side?.length ? `<div class="side"><span class="eyebrow">Side reads</span>${g.side.map((x) => chip(x.book, x.note)).join("")}</div>` : ""}
      ${g.note ? `<p class="ser-note">${esc(g.note)}</p>` : ""}</section>`;
  });
  return h + `</div>${s.credit ? `<p class="credit">${esc(s.credit)}</p>` : ""}`;
}

function openSheet(bookId, silent) {
  S.sheet = bookId;
  const s = S.series, bk = bookOf(bookId), st = bstate(bookId);
  const g = (s.groups || []).find((x) => x.books.includes(bookId));
  const earlier = g ? g.books.slice(0, g.books.indexOf(bookId)) : [];
  document.querySelector(".sheet-back")?.remove();
  const el = document.createElement("div");
  el.className = "sheet-back";
  el.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-t">
    <h3 id="sheet-t">${esc(bk.title)}</h3>
    <div class="sub">${esc(s.types?.[bk.type]?.label || "")}${g ? ` · ${esc(g.name)}` : ""}</div>
    <button class="opt" data-act="set" data-v="done" aria-pressed="${st === "done"}">Finished</button>
    <button class="opt" data-act="set" data-v="now" aria-pressed="${st === "now"}">Reading now</button>
    ${earlier.length && earlier.some((b) => !P().finished.has(b)) ? `<button class="opt" data-act="set" data-v="now-earlier">Reading now<small>and mark the ${earlier.length} earlier ${esc(g.name)} book${earlier.length > 1 ? "s" : ""} as finished</small></button>` : ""}
    <button class="opt" data-act="set" data-v="todo" aria-pressed="${st === "todo"}">Not read yet</button>
    <button class="btn ghost small" data-act="close-sheet" style="align-self:flex-end">Close</button>
  </div>`;
  el.addEventListener("click", (e) => { if (e.target === el) closeSheet(); });
  document.body.append(el);
  if (!silent) el.querySelector(".opt")?.focus();
}
function closeSheet() { S.sheet = null; document.querySelector(".sheet-back")?.remove(); }
function setBook(bookId, v) {
  const p = P();
  if (v === "done") { p.finished.add(bookId); if (p.current === bookId) p.current = null; }
  if (v === "todo") { p.finished.delete(bookId); if (p.current === bookId) p.current = null; }
  if (v === "now" || v === "now-earlier") {
    p.current = bookId; p.finished.delete(bookId);
    if (v === "now-earlier") {
      const g = S.series.groups.find((x) => x.books.includes(bookId));
      g.books.slice(0, g.books.indexOf(bookId)).forEach((b) => p.finished.add(b));
    }
  }
  closeSheet(); saveProgress(); render();
  toast(v === "done" ? "Marked as finished" : v === "todo" ? "Marked as not read" : "Set as your current book");
}

// ---------- II. the story so far ----------
function storyHTML() {
  const s = S.series;
  const fin = s._order.filter((b) => P().finished.has(b) && s.summaries[b]?.length);
  const cur = P().current;
  const corners = `<img class="ctl" src="assets/corner-tl.webp" alt=""><img class="cbr" src="assets/corner-br.webp" alt="">`;
  const card = (b) => {
    const bk = bookOf(b), badge = s.assets.badges?.[b];
    const cast = s.characters.filter((c) => known(c) && firstMet(c) === b && !veiled(c));
    return `<section class="summary">${corners}
      <div class="sum-head">${badge ? `<img class="sum-badge" src="${badge}" alt="">` : ""}<span class="eyebrow">${bk.year ? `${bk.year} · ` : ""}Finished</span><h2>${esc(bk.title)}</h2></div>
      <div class="sum-body">${s.summaries[b].map((t) => `<p>${esc(t)}</p>`).join("")}</div>
      ${cast.length ? `<div class="cast"><span class="eyebrow">First met here</span><div class="faces">${cast.map((c) =>
        `<button type="button" class="face" data-act="goto-book" data-book="${esc(b)}" title="${esc(c.name)}">${thumb(c)}<span>${esc(c.name)}</span></button>`).join("")}</div></div>` : ""}
    </section>`;
  };
  let h = `<div class="section-h"><h2>The story so far</h2><span class="eyebrow">${fin.length} summar${fin.length === 1 ? "y" : "ies"} · spoilers only for books you've finished</span></div><div class="story">`;
  if (!fin.length && !cur) h += `<div class="start"><h3>No finished books yet</h3><p>Mark books as finished on the reading map and their summaries appear here.</p></div>`;
  h += fin.map(card).join("");
  if (cur) h += `<section class="summary pending"><div class="sum-head"><span class="eyebrow">Reading now</span><h2>${esc(bookOf(cur).title)}</h2></div><div class="sum-body"><p>${s.summaries[cur]?.length ? "Its summary unlocks when you mark it as finished." : "No summary for this one yet."}</p></div></section>`;
  const missing = s._order.filter((b) => P().finished.has(b) && !s.summaries[b]?.length).length;
  if (missing) h += `<p class="credit">${missing} finished book${missing > 1 ? "s don't" : " doesn't"} have a summary yet.</p>`;
  return h + `</div><img class="divider" src="assets/divider.webp" alt="">`;
}

// ---------- III. the characters ----------
function charsHTML(bookParam, base) {
  const s = S.series, p = P();
  const knownChars = s.characters.filter(known);
  if (!knownChars.length) {
    return `<div class="start"><h3>No one met yet</h3><p>Set the book you're reading (and the ones you've finished) on the <a href="${base}/map">reading map</a>. Characters from those books appear here, and new ones stay greyed out until you tap them.</p></div>`;
  }
  const tabBooks = s._order.filter((b) => seen(b) && s.characters.some((c) => c.books.includes(b)));
  const saved = ls.get(`sa-chars-${s.id}`);
  let view = bookParam || saved || (p.current && tabBooks.includes(p.current) ? p.current : "all");
  if (view !== "all" && !tabBooks.includes(view)) view = "all";
  ls.set(`sa-chars-${s.id}`, view);

  const btn = (key, label, n, cur) => `<button type="button" data-act="tab" data-v="${esc(key)}" aria-pressed="${view === key}" class="${cur ? "cur" : ""}">${label}<span class="n">${n}</span></button>`;
  let nav = btn("all", "Everyone so far", knownChars.length, false);
  tabBooks.forEach((b) => {
    const badge = s.assets.badges?.[b];
    nav += btn(b, (badge ? `<img class="bb" src="${badge}" alt="">` : "") + esc(bookOf(b).title), s.characters.filter((c) => c.books.includes(b)).length, b === p.current);
  });

  const q = S.q.toLowerCase();
  const match = (c) => !q || (veiled(c) ? c.name : `${c.name} ${c.role} ${c.desc}`).toLowerCase().includes(q);
  let pool = view === "all" ? knownChars : s.characters.filter((c) => c.books.includes(view));
  pool = pool.filter(match);
  const news = s.characters.filter(isNew);
  const met = news.filter((c) => p.revealed.has(c.id)).length;

  const sect = (title, sub, list) => list.length ? `<div class="section-h"><h2>${esc(title)}</h2><span class="eyebrow">${esc(sub)}</span></div><div class="grid">${list.map((c) => cardHTML(c, view)).join("")}</div>` : "";
  let h = "";
  if (view === "all") {
    tabBooks.forEach((b) => { h += sect(bookOf(b).title, `${bookOf(b).year ? bookOf(b).year + " · " : ""}first appearances`, pool.filter((c) => firstMet(c) === b)); });
  } else if (view === p.current) {
    h += sect("New in this book", `${met} of ${news.length} revealed`, pool.filter(isNew));
    h += sect("Familiar faces", "back from earlier books", pool.filter((c) => !isNew(c)));
  } else {
    h += sect("First appearances", bookOf(view).year ? String(bookOf(view).year) : "", pool.filter((c) => firstMet(c) === view));
    h += sect("Also appearing", "met in other books you've read", pool.filter((c) => firstMet(c) !== view));
  }
  return `<nav class="books" aria-label="Books">${nav}</nav>
    <div class="tools">
      <input id="q" type="search" placeholder="Find a character…" aria-label="Find a character" autocomplete="off">
      <div class="right">
        <span class="count">${pool.length} shown</span>
        ${news.length && met < news.length ? `<button type="button" data-act="reveal-all">Reveal all new</button>` : ""}
        ${news.length && met > 0 ? `<button type="button" data-act="hide-all">Grey them out again</button>` : ""}
      </div>
    </div>
    ${h || `<p class="empty">No one by that name in the index yet.</p>`}`;
}

function cardHTML(c, view) {
  const p = P();
  const f = firstMet(c);
  if (veiled(c)) {
    return `<button type="button" class="card veiled" data-act="reveal" data-id="${esc(c.id)}" aria-label="Reveal ${esc(c.name)}">
      <div class="cat"><span>New · ${esc(shortOf(p.current))}</span><span class="no">${esc(catNo(c))}</span></div>
      <img class="mseal" src="assets/mystery-seal.webp" alt="">
      <div class="vname">${esc(c.name)}</div>
      <div class="hint">${esc(c.hint || "Someone new")}</div>
      <div class="cta">Tap to see who they are</div>
    </button>`;
  }
  const tags = c.books.filter(seen).map((b) => `<span class="tag ${b === f ? "first" : ""}" title="${esc(bookOf(b).title)}">${esc(shortOf(b))}</span>`).join("");
  const label = view === p.current && !isNew(c) ? "Returning" : `First met in ${shortOf(f)}`;
  return `<article class="card ${S.justRevealed === c.id ? "revealing" : ""}" data-id="${esc(c.id)}">
    ${isNew(c) ? '<span class="badge-new">New</span>' : ""}
    <div class="cat"><span>${esc(label)}</span><span class="no">${esc(catNo(c))}</span></div>
    <div class="head">${thumb(c)}<div class="who"><h3>${esc(c.name)}</h3><div class="role">${esc(c.role)}</div></div></div>
    <p>${esc(c.desc)}</p>
    <div class="tags">${tags}</div>
  </article>`;
}

// ---------- librarian's desk (admin) ----------
async function renderAdmin() {
  $app.innerHTML = topbar() + `<p class="loading">Opening the desk…</p>`;
  const [members, invites, series] = await Promise.all([S.be.listMembers(), S.be.listInvites(), S.be.listSeries()]);
  S.seriesList = series;
  const inviteUrl = (code) => `${location.origin}${location.pathname}?invite=${encodeURIComponent(code)}`;
  members.sort((a, b) => a.email.localeCompare(b.email));
  const open = invites.filter((i) => !i.usedBy), used = invites.filter((i) => i.usedBy);
  $app.innerHTML = topbar() + `
    <div class="section-h"><h2>Librarian's desk</h2><span class="eyebrow">Only you can see this</span></div>
    <div class="admin">
      <section class="panel">
        <h2>Guest list</h2>
        <p>People whose Google account is on this list can open the library. You (${esc(adminEmails.join(", "))}) always can.</p>
        <form class="row" data-form="add-member">
          <input type="email" id="newMember" required placeholder="friend@gmail.com" aria-label="Friend's Google email">
          <button class="btn small" type="submit">Add to guest list</button>
        </form>
        <ul class="list">${members.map((m) => `<li><span>${esc(m.email)} ${m.invite ? '<span class="pill">via invite</span>' : ""}</span>
          <button class="linkbtn" data-act="remove-member" data-v="${esc(m.email)}">Remove</button></li>`).join("") || `<li><span class="empty">No guests yet.</span></li>`}</ul>
      </section>

      <section class="panel">
        <h2>Invite links</h2>
        <p>Each link works once: the first Google account that opens it and signs in joins the guest list.</p>
        <form class="row" data-form="new-invite">
          <input type="text" id="inviteNote" placeholder="Who it's for (optional)" aria-label="Who the invite is for">
          <button class="btn small" type="submit">Create invite link</button>
        </form>
        <ul class="list">${open.map((i) => `<li><span>${esc(i.note || "Unnamed invite")}<br><code>${esc(inviteUrl(i.code))}</code></span>
          <span class="row"><button class="btn small ghost" data-act="copy" data-v="${esc(inviteUrl(i.code))}">Copy link</button>
          <button class="linkbtn" data-act="delete-invite" data-v="${esc(i.code)}">Delete</button></span></li>`).join("") || `<li><span class="empty">No open invites.</span></li>`}</ul>
        ${used.length ? `<p>${used.length} invite${used.length > 1 ? "s" : ""} already used.</p>` : ""}
      </section>

      <section class="panel">
        <h2>Series content</h2>
        <p>Upload a series bundle (a <code>.json</code> file Claude prepares in the git-ignored <code>content/</code> folder). Uploading again replaces that series' characters and summaries; readers' progress is kept.</p>
        <div class="row"><input type="file" id="bundle" accept=".json,application/json" aria-label="Series bundle file"><button class="btn small" data-act="import">Upload</button></div>
        <div class="log" id="importLog"></div>
        <ul class="list">${series.map((x) => `<li><span><b>${esc(x.title)}</b> <code>${esc(x.id)}</code></span><a class="linkbtn" href="#/s/${esc(x.id)}">Open</a></li>`).join("") || `<li><span class="empty">No series yet.</span></li>`}</ul>
      </section>
    </div>${footer()}`;
}

// ---------- events ----------
$app.addEventListener("input", (e) => {
  if (e.target.id === "q") { S.q = e.target.value; render(); }
});
$app.addEventListener("submit", async (e) => {
  const f = e.target.dataset.form; if (!f) return;
  e.preventDefault();
  try {
    if (f === "add-member") {
      const em = lower(document.getElementById("newMember").value);
      if (!em) return;
      await S.be.addMember(em, S.user.email); toast(`${em} can now sign in`);
    }
    if (f === "new-invite") {
      const code = await S.be.createInvite(S.user.email, document.getElementById("inviteNote").value.trim());
      await copy(`${location.origin}${location.pathname}?invite=${code}`, "Invite link created and copied");
    }
    render();
  } catch (err) { console.error(err); toast(err.message || "That didn't work"); }
});
async function copy(text, msg = "Copied") {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch { prompt("Copy this link:", text); }
}

document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-act]"); if (!t) return;
  const act = t.dataset.act, v = t.dataset.v;
  try {
    switch (act) {
      case "signin": await S.be.signIn(); break;
      case "signout": await S.be.signOut(); location.hash = ""; break;
      case "section": go(`#/s/${encodeURIComponent(S.series.id)}/${v}`); break;
      case "tab": ls.set(`sa-chars-${S.series.id}`, v); S.q = ""; go(`#/s/${encodeURIComponent(S.series.id)}/chars/${encodeURIComponent(v)}`); break;
      case "goto-book": ls.set(`sa-chars-${S.series.id}`, t.dataset.book); go(`#/s/${encodeURIComponent(S.series.id)}/chars/${encodeURIComponent(t.dataset.book)}`); scrollTo({ top: 0 }); break;
      case "book": openSheet(t.dataset.book); break;
      case "close-sheet": closeSheet(); break;
      case "set": setBook(S.sheet, v); break;
      case "reveal": P().revealed.add(t.dataset.id); S.justRevealed = t.dataset.id; saveProgress(); render(); break;
      case "reveal-all": S.series.characters.filter(isNew).forEach((c) => P().revealed.add(c.id)); saveProgress(); render(); break;
      case "hide-all": S.series.characters.filter(isNew).forEach((c) => P().revealed.delete(c.id)); saveProgress(); render(); break;
      case "remove-member": await S.be.removeMember(v); toast("Removed from the guest list"); render(); break;
      case "delete-invite": await S.be.deleteInvite(v); toast("Invite deleted"); render(); break;
      case "copy": await copy(v, "Link copied"); break;
      case "import": {
        const file = document.getElementById("bundle").files[0];
        const log = document.getElementById("importLog");
        if (!file) { toast("Choose a bundle file first"); break; }
        t.disabled = true; log.textContent = "Reading file…\n";
        const bundle = JSON.parse(await file.text());
        await S.be.importBundle(bundle, (m) => { log.textContent += m + "\n"; });
        S.seriesList = null; S.series = null; delete S.assetsCache[bundle.id];
        toast("Series uploaded"); t.disabled = false;
        break;
      }
    }
  } catch (err) {
    console.error(err); toast(err.message || "That didn't work");
    if (act === "import") { t.disabled = false; document.getElementById("importLog").textContent += `Failed: ${err.message}\n`; }
  }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.sheet) closeSheet(); });

boot();
