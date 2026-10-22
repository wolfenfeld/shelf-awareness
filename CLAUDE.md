# Shelf Awareness: notes for Claude

Context handed over from a Claude (Cowork) session on 2026-10-22. Read README.md for the
architecture, Firestore layout and setup steps; this file covers decisions and how to work here.

## What this is
An invite-only reading companion for Amit and his friends, hosted on GitHub Pages
(`https://wolfenfeld.github.io/shelf-awareness/`, custom subdomain to be added later).
Three sections per series: **Reading map**, **The story so far**, **The characters**.
Each reader's progress (finished books, current book, revealed characters) drives spoilers.
It grew out of a single-page Claude artifact, "Discworld Who's Who"
(https://claude.ai/artifact/Pv8Zt97a1i5bXr8Zsz5EfV), which is still Amit's personal copy.

## Decisions already made
- Repo: personal GitHub account `wolfenfeld` (wolfenfeld@gmail.com). Remote uses the SSH host
  alias `github-personal`. Commit as `wolfenfeld <wolfenfeld@gmail.com>`.
- Plain HTML/CSS/JS modules, **no build step**. Firebase JS SDK 13.1.0 from gstatic.
- Firebase project `shelf-awareness-4014c`: Google sign-in + Firestore, free Spark plan.
  Firebase was chosen over Supabase because free Supabase projects pause when idle.
- **Invite-only**, including content: portraits, descriptions and summaries live in
  Firestore, never in this public repo. `content/` is git-ignored; bundles are uploaded from
  the in-app Librarian's desk. Guest list = `members/{email}`; one-time invite links = `invites/{code}`.
- Admin email is hard-coded in both `js/firebase-config.js` and `firestore.rules` (keep in sync).
- Multi-series design: every series is a bundle `content/<id>.json` with
  `{id, title, subtitle, tagline, order, credit, types, books, groups, assets, characters, summaries}`.
  Characters list `books` in reading order (first = first appearance); spoiler logic is generic.
- Domain setup deferred.

## Content rules (important)
- Character descriptions must stay spoiler-safe: describe someone as they are when first met.
- Summaries only for books Amit has finished. As of handover: finished The Colour of Magic,
  The Light Fantastic, Sourcery, Eric, Interesting Times; currently reading The Last Continent.
- Portraits come from Amit's own AI-generated portrait sheets (circles with name banners);
  crop each circle, resize to 128px, embed as a data-URI webp in the character's `portrait`.
  Do not draw or source copyrighted character art.

## Status at handover
- Committed: full app, rules, README; Firebase web config added (commit e73e33f).
- Amit published `firestore.rules` in the console.
- Still to verify: GitHub Pages enabled, `wolfenfeld.github.io` in Firebase authorized domains,
  first sign-in, uploading `content/discworld.json` from the Librarian's desk, invite flow with a friend.
- Ideas raised but not built: friends' progress view, custom subdomain, City Watch etc. characters.

## Working here
- Local preview without Firebase: `python3 -m http.server` then open `http://localhost:8000/?demo`
  (reads `content/*.json`, stores progress in the browser).
- Keep the parchment design system in `css/app.css` (tokens on `:root`, dark mode via
  `prefers-color-scheme` and `[data-theme]`).
