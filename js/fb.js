// Firebase backend: Google sign-in, guest list, series content and reading progress.
const V = "13.1.0";
const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
const {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut: fbSignOut,
} = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
const {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, getDocs, setDoc, deleteDoc, collection, writeBatch, serverTimestamp,
} = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);

export function createBackend(config, adminEmails) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  let db;
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    db = initializeFirestore(app, {});
  }
  getRedirectResult(auth).catch(() => {});

  const lower = (e) => (e || "").trim().toLowerCase();
  const isAdminEmail = (e) => adminEmails.map(lower).includes(lower(e));
  const userOf = (u) => u && ({
    uid: u.uid, email: lower(u.email), name: u.displayName || u.email, photo: u.photoURL || "",
    verified: u.emailVerified,
  });

  return {
    kind: "firebase",

    onAuth(cb) { return onAuthStateChanged(auth, (u) => cb(userOf(u))); },

    async signIn() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"].includes(e.code)) {
          await signInWithRedirect(auth, provider);
        } else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
          throw e;
        }
      }
    },

    signOut() { return fbSignOut(auth); },

    async membership(user) {
      if (isAdminEmail(user.email)) return { role: "admin" };
      const snap = await getDoc(doc(db, "members", user.email));
      return snap.exists() ? { role: snap.data().role || "member" } : null;
    },

    async redeemInvite(code, user) {
      const ref = doc(db, "invites", code);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("This invite link isn't valid.");
      if (snap.data().usedBy) throw new Error("This invite link has already been used.");
      const b = writeBatch(db);
      b.set(doc(db, "members", user.email), { role: "member", invite: code, joinedAt: serverTimestamp(), name: user.name || "" });
      b.update(ref, { usedBy: user.email, usedAt: serverTimestamp() });
      await b.commit();
    },

    async listSeries() {
      const snap = await getDocs(collection(db, "series"));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    },

    async loadSeries(id) {
      const [s, a, chars, sums] = await Promise.all([
        getDoc(doc(db, "series", id)),
        getDoc(doc(db, "series", id, "meta", "assets")),
        getDocs(collection(db, "series", id, "characters")),
        getDocs(collection(db, "series", id, "summaries")),
      ]);
      if (!s.exists()) return null;
      const summaries = {};
      sums.forEach((d) => { summaries[d.id] = d.data().paragraphs || []; });
      return {
        id, ...s.data(),
        assets: a.exists() ? a.data() : {},
        characters: chars.docs.map((d) => ({ id: d.id, ...d.data() })).sort((x, y) => (x.order ?? 0) - (y.order ?? 0)),
        summaries,
      };
    },

    async getAssets(id) {
      const a = await getDoc(doc(db, "series", id, "meta", "assets"));
      return a.exists() ? a.data() : null;
    },

    async getProgress(uid, seriesId) {
      const snap = await getDoc(doc(db, "users", uid, "progress", seriesId));
      return snap.exists() ? snap.data() : null;
    },

    saveProgress(uid, seriesId, p) {
      return setDoc(doc(db, "users", uid, "progress", seriesId), {
        finished: p.finished, current: p.current ?? null, revealed: p.revealed, updatedAt: serverTimestamp(),
      });
    },

    // ----- admin -----
    async listMembers() {
      const snap = await getDocs(collection(db, "members"));
      return snap.docs.map((d) => ({ email: d.id, ...d.data() }));
    },
    addMember(email, by) {
      return setDoc(doc(db, "members", lower(email)), { role: "member", addedBy: by, joinedAt: serverTimestamp() });
    },
    removeMember(email) { return deleteDoc(doc(db, "members", lower(email))); },

    async listInvites() {
      const snap = await getDocs(collection(db, "invites"));
      return snap.docs.map((d) => ({ code: d.id, ...d.data() }));
    },
    async createInvite(by, note) {
      const bytes = crypto.getRandomValues(new Uint8Array(18));
      const code = Array.from(bytes, (x) => x.toString(36).padStart(2, "0")).join("").slice(0, 24);
      await setDoc(doc(db, "invites", code), { createdBy: by, note: note || "", createdAt: serverTimestamp(), usedBy: null });
      return code;
    },
    deleteInvite(code) { return deleteDoc(doc(db, "invites", code)); },

    // Upload a series bundle (JSON made by Claude): series doc, assets, characters, summaries.
    async importBundle(bundle, log = () => {}) {
      const id = bundle.id;
      if (!id || !bundle.title) throw new Error("This file doesn't look like a series bundle.");
      const { assets, characters = [], summaries = {}, ...meta } = bundle;
      await setDoc(doc(db, "series", id), { ...meta, updatedAt: serverTimestamp() });
      log(`Series “${bundle.title}” saved.`);
      await setDoc(doc(db, "series", id, "meta", "assets"), assets || {});
      log("Artwork saved.");
      const writes = [];
      const keepChars = new Set(characters.map((c) => c.id));
      characters.forEach((c) => writes.push(["set", doc(db, "series", id, "characters", c.id), c]));
      Object.entries(summaries).forEach(([bookId, paragraphs]) =>
        writes.push(["set", doc(db, "series", id, "summaries", bookId), { paragraphs }]));
      const oldChars = await getDocs(collection(db, "series", id, "characters"));
      oldChars.forEach((d) => { if (!keepChars.has(d.id)) writes.push(["del", d.ref]); });
      const oldSums = await getDocs(collection(db, "series", id, "summaries"));
      oldSums.forEach((d) => { if (!(d.id in summaries)) writes.push(["del", d.ref]); });
      // Batches stay well under Firestore's 10 MiB / 500-write request limits.
      for (let i = 0; i < writes.length; i += 40) {
        const b = writeBatch(db);
        writes.slice(i, i + 40).forEach(([op, ref, data]) => (op === "set" ? b.set(ref, data) : b.delete(ref)));
        await b.commit();
        log(`Saved ${Math.min(i + 40, writes.length)} of ${writes.length} entries…`);
      }
      log(`Done: ${characters.length} characters, ${Object.keys(summaries).length} summaries.`);
    },
  };
}
