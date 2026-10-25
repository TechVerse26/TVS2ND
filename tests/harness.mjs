// tests/harness.mjs — সিনারিও চালানোর কমন কোড (অফিশিয়াল Emulator-টেস্ট ও অফলাইন সিমুলেটর দুটোই ব্যবহার করে)
import {
  doc, getDoc, getDocs, getCountFromServer, setDoc, updateDoc, deleteDoc, collection, query, where, limit, writeBatch,
  serverTimestamp, increment, arrayUnion, arrayRemove, Timestamp
} from "firebase/firestore";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { SEED, AUTH } from "./scenarios.mjs";

export const revive = (v) => {
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
    if (o.op === "create" || o.op === "set") return b.set(ref(o.path), revive(o.data), o.merge ? { merge: true } : undefined);
    if (o.op === "update") return b.update(ref(o.path), revive(o.data));
    return b.delete(ref(o.path));
  };
  const q = () => {
    const cons = Object.entries(sc.where || {}).map(([f, v]) => where(f, "==", v));
    if (sc.limit != null) cons.push(limit(sc.limit));
    return query(collection(db, sc.path), ...cons);
  };
  switch (sc.op) {
    case "get": return getDoc(ref(sc.path));
    case "list": return getDocs(q());
    case "count": return getCountFromServer(q());
    case "create": case "set": return setDoc(ref(sc.path), revive(sc.data), sc.merge ? { merge: true } : undefined);   // বিদ্যমান ডকে setDoc = update (Firestore-এর নিয়ম)
    case "update": return updateDoc(ref(sc.path), revive(sc.data));
    case "delete": return deleteDoc(ref(sc.path));
    case "batch": { const b = writeBatch(db); sc.ops.forEach((o) => addTo(b, o)); return b.commit(); }
    default: throw new Error("unknown op " + sc.op);
  }
}

/** প্রতিটা টেস্টের আগে: ডেটাবেস খালি করে সিড বসায় (rules বন্ধ রেখে) */
export async function resetAndSeed(env) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [path, data] of Object.entries(SEED)) await setDoc(doc(db, path), revive(data));
  });
}

/** একটা সিনারিও চালায়; প্রত্যাশা না মিললে throw করে */
export async function executeScenario(env, sc) {
  if (sc.without?.length) {
    await env.withSecurityRulesDisabled(async (ctx) => { for (const p of sc.without) await deleteDoc(doc(ctx.firestore(), "tvProject/main/" + p)); });
  }
  const ctx = sc.as ? env.authenticatedContext(sc.as, { ...(AUTH[sc.as] || {}), ...(sc.tok || {}) }) : env.unauthenticatedContext();
  await (sc.ok ? assertSucceeds : assertFails)(run(ctx, sc));
}
