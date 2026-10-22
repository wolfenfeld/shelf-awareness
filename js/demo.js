// Local preview backend (open index.html?demo). Reads series bundles from ./content/
// (which is git-ignored) and keeps progress in this browser only. No Firebase needed.
export function createDemoBackend(seriesIds = ["discworld"]) {
  const user = { uid: "demo", email: "demo@example.com", name: "Demo reader", photo: "", verified: true };
  const key = (s) => `sa-demo-progress-${s}`;
  const cache = {};
  let listeners = [];
  let signedIn = true;
  const fire = () => listeners.forEach((cb) => cb(signedIn ? user : null));
  const load = async (id) => (cache[id] ||= await (await fetch(`content/${id}.json`)).json());
  return {
    kind: "demo",
    onAuth(cb) { listeners.push(cb); setTimeout(() => cb(signedIn ? user : null)); return () => {}; },
    async signIn() { signedIn = true; fire(); },
    async signOut() { signedIn = false; fire(); },
    async membership() { return { role: "admin" }; },
    async redeemInvite() {},
    async listSeries() {
      const out = [];
      for (const id of seriesIds) {
        try { const b = await load(id); const { characters, summaries, ...m } = b; out.push(m); } catch {}
      }
      return out;
    },
    async loadSeries(id) {
      try { const b = await load(id); return { ...b }; } catch { return null; }
    },
    async getProgress(uid, s) { try { return JSON.parse(localStorage.getItem(key(s))); } catch { return null; } },
    async saveProgress(uid, s, p) { try { localStorage.setItem(key(s), JSON.stringify(p)); } catch {} },
    async listMembers() { return [{ email: "friend@example.com", role: "member" }]; },
    async addMember() {}, async removeMember() {},
    async listInvites() { return []; },
    async createInvite() { return "demo-invite-code"; },
    async deleteInvite() {},
    async importBundle(b, log) { log("Preview mode: nothing is uploaded."); },
  };
}
