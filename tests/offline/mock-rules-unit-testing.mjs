// tests/offline/mock-rules-unit-testing.mjs — '@firebase/rules-unit-testing'-এর ছোট নকল
import { FirestoreSim } from "./firestore-sim.mjs";

export let LAST_SIM = null;
export async function initializeTestEnvironment({ firestore }) {
  const sim = new FirestoreSim(firestore.rules); LAST_SIM = sim;
  const ctxFor = (auth, noRules = false) => ({ firestore: () => ({ _sim: sim, _auth: auth, _noRules: noRules }) });
  return {
    _sim: sim,
    authenticatedContext: (uid, token = {}) => ctxFor({ uid, token }),
    unauthenticatedContext: () => ctxFor(null),
    clearFirestore: async () => sim.clear(),
    withSecurityRulesDisabled: async (cb) => cb(ctxFor(null, true)),
    cleanup: async () => {
      if (process.env.TV_SIM_QUIET) return;
      const s = sim.stats;
      console.log(`\n[offline-sim] অনুমোদিত অপারেশনের সর্বোচ্চ document-access-call (রিপিট কলও আলাদা গোনা): প্রতি অপারেশনে ${s.maxOpCalls} [${s.maxOpWhere}] (সীমা ১০), প্রতি batch/অনুরোধে ${s.maxRequestCalls} (সীমা ২০)`);
      if (s.lint.size) { console.log("[offline-sim] lint:"); for (const l of s.lint) console.log("  - " + l); }
    }
  };
}
export async function assertSucceeds(p) { return await p; }
export async function assertFails(p) {
  let ok = false;
  try { await p; ok = true; } catch (e) {
    if (e && e.code === "permission-denied") return e;
    throw new Error("প্রত্যাশিত permission-denied নয়, অন্য এরর: " + (e && (e.code || e.message)));
  }
  if (ok) throw new Error("Expected request to fail, but it succeeded.");
}
