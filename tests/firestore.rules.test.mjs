// tests/firestore.rules.test.mjs
// অফিশিয়াল Firebase Firestore Emulator-এ firestore.rules যাচাই — tests/scenarios.mjs-এর প্রতিটা সিনারিও এখানে চলে।
// চালাতে:  cd tests && npm install && npm test        (Java ১১+ লাগে — Firebase Emulator-এর জন্য)
import { readFileSync } from "node:fs";
import { describe, it, before, after, beforeEach } from "node:test";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, limit, writeBatch,
  serverTimestamp, increment, arrayUnion, arrayRemove, Timestamp
} from "firebase/firestore";
import { SEED, scenarios } from "./scenarios.mjs";

const RULES = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
let env;

const revive = (v) => {
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === "object") {
    if (v.$ === "server") return serverTimestamp();
    if (v.$ === "ts") return Timestamp.fromMillis(v.ms);
    if (v.$ === "inc") return increment(v.n);
    if (v.$ === "union") return arrayUnion(...v.v);
    if (v.$ === "remove") return arrayRemove(...v.v);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]));
  }
  return v;
};

function run(ctx, sc) {
  const db = ctx.firestore();
  const ref = (p) => doc(db, p);
  const addTo = (b, o) => {
    if (o.op === "create" || o.op === "set") return b.set(ref(o.path), revive(o.data));
    if (o.op === "update") return b.update(ref(o.path), revive(o.data));
    return b.delete(ref(o.path));
  };
  switch (sc.op) {
    case "get": return getDoc(ref(sc.path));
    case "list": {
      const cons = Object.entries(sc.where).map(([f, v]) => where(f, "==", v));
      if (sc.limit != null) cons.push(limit(sc.limit));
      return getDocs(query(collection(db, sc.path), ...cons));
    }
    case "create": case "set": return setDoc(ref(sc.path), revive(sc.data));   // বিদ্যমান ডকে setDoc = update (Firestore-এর নিয়ম)
    case "update": return updateDoc(ref(sc.path), revive(sc.data));
    case "delete": return deleteDoc(ref(sc.path));
    case "batch": { const b = writeBatch(db); sc.ops.forEach((o) => addTo(b, o)); return b.commit(); }
    default: throw new Error("unknown op " + sc.op);
  }
}

before(async () => {
  env = await initializeTestEnvironment({ projectId: "tv-rules-test", firestore: { rules: RULES } });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [path, data] of Object.entries(SEED)) await setDoc(doc(db, path), revive(data));
  });
});

for (const group of [...new Set(scenarios.map((s) => s.group))]) {
  describe(group, () => {
    for (const sc of scenarios.filter((s) => s.group === group)) {
      it(`${sc.ok ? "ALLOW" : "DENY "}  ${sc.name}`, async () => {
        const ctx = sc.as ? env.authenticatedContext(sc.as) : env.unauthenticatedContext();
        await (sc.ok ? assertSucceeds : assertFails)(run(ctx, sc));
      });
    }
  });
}
