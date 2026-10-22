# Shelf Awareness

An invite-only reading companion for friends. For each book series it has:

1. **Reading map**: every book, grouped into sub-series. Tap a book to mark it finished or set it as the one you're reading.
2. **The story so far**: summaries of the books *you* have finished, and nothing beyond them.
3. **The characters**: everyone you've met. New characters in your current book stay greyed out until you tap them.

Each reader has their own progress, so spoilers follow their reading, not anyone else's.

## How it's built

- Plain HTML, CSS and JavaScript modules, no build step. Hosted on GitHub Pages.
- **Firebase Authentication** (Google sign-in) and **Cloud Firestore** for the guest list, series content and each reader's progress.
- Series content (portraits, descriptions, summaries) is **not** in this repository. It lives in Firestore and only invited members can read it. Bundles are kept locally in the git-ignored `content/` folder and uploaded from the Librarian's desk.

```
index.html            page shell
css/app.css           styles (parchment theme, light and dark)
js/app.js             the app: routing, views, events
js/fb.js              Firebase backend
js/demo.js            local preview backend (index.html?demo)
js/firebase-config.js Firebase web settings + admin email
firestore.rules       access rules: paste into the Firebase console
assets/               shared artwork (textures, seals, stamp, ornaments)
content/              series bundles (git-ignored, never pushed)
```

## Firestore layout

| Path | What it holds | Who can read / write |
|---|---|---|
| `members/{email}` | guest list | admin; each person can read their own entry |
| `invites/{code}` | one-time invite links | admin; a signed-in person can redeem one for themselves |
| `series/{id}` (+ `meta/assets`, `characters/*`, `summaries/*`) | series content | members read, admin writes |
| `users/{uid}/progress/{seriesId}` | a reader's finished books, current book and revealed characters | only that reader |

## One-time setup

1. **Firebase project**: create one at console.firebase.google.com (Analytics not needed).
2. **Authentication** → Sign-in method → enable **Google**. Under Settings → Authorized domains, add `wolfenfeld.github.io` (and your custom domain later).
3. **Firestore Database** → Create database (production mode). Rules tab → paste `firestore.rules` → Publish.
4. **Project settings** → Your apps → add a **Web app** → copy the config into `js/firebase-config.js`.
5. **GitHub** → repository Settings → Pages → Deploy from branch `main`, folder `/ (root)`.
6. Open the site, sign in as the admin, go to the **Librarian's desk** and upload `content/discworld.json`.

## Adding a series later

Ask Claude for a new bundle in `content/<series-id>.json` (same shape as the Discworld one), then upload it from the Librarian's desk. Uploading the same series again replaces its content and keeps everyone's progress.

## Local preview

Serve the folder (for example `python3 -m http.server`) and open `http://localhost:8000/?demo`. Preview mode reads `content/*.json` directly and keeps progress in the browser, with no Firebase involved.

## Custom domain (later)

Add a `CNAME` DNS record pointing your subdomain at `wolfenfeld.github.io`, set it under Settings → Pages, enable HTTPS, and add the domain to Firebase's authorized domains.
