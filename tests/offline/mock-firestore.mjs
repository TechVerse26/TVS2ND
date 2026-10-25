// tests/offline/mock-firestore.mjs — 'firebase/firestore'-এর ছোট নকল (শুধু tests/firestore.rules.test.mjs যা ব্যবহার করে)
import { Ts } from "./rules-engine.mjs";
import { Sentinel } from "./firestore-sim.mjs";

export const serverTimestamp = () => new Sentinel("server");
export const increment = (n) => new Sentinel("inc", n);
export const arrayUnion = (...v) => new Sentinel("union", v);
export const arrayRemove = (...v) => new Sentinel("remove", v);
export const deleteField = () => new Sentinel("delete");
export const Timestamp = { fromMillis: (ms) => new Ts(ms), now: () => new Ts(Date.now()) };

class DocRef { constructor(db, path) { this.db = db; this.path = path; this.id = path.split("/").pop(); } }
class CollRef { constructor(db, path) { this.db = db; this.path = path; } }
export const doc = (db, ...segs) => new DocRef(db, segs.join("/"));
export const collection = (db, ...segs) => new CollRef(db, segs.join("/"));
export const where = (field, op, value) => ({ k: "where", field, op, value });
export const limit = (n) => ({ k: "limit", n });
export const orderBy = (field, dir = "asc") => ({ k: "orderBy", field, dir });
export const query = (coll, ...cons) => ({ coll, cons });

const sleep = () => Promise.resolve();
export async function getDoc(ref) { await sleep(); return ref.db._sim.get(ref.path, ref.db._auth); }
const toQ = (q) => ({ where: q.cons.filter((c) => c.k === "where"), limit: q.cons.find((c) => c.k === "limit")?.n ?? null });
export async function getDocs(q) {
  await sleep();
  const rows = q.coll.db._sim.list(q.coll.path, toQ(q), q.coll.db._auth);
  return { docs: rows, size: rows.length, empty: rows.length === 0, forEach: (f) => rows.forEach(f) };
}
export async function getCountFromServer(q) {
  await sleep();
  const rows = q.coll.db._sim.list(q.coll.path, toQ(q), q.coll.db._auth);
  return { data: () => ({ count: rows.length }) };
}
const run = (db, ops) => (db._noRules ? db._sim.commit(ops, db._auth, { noRules: true }) : db._sim.commit(ops, db._auth));
export async function setDoc(ref, data, opts) { await sleep(); run(ref.db, [{ type: "set", path: ref.path, data, merge: !!(opts && opts.merge) }]); }
export async function updateDoc(ref, data) { await sleep(); run(ref.db, [{ type: "update", path: ref.path, data }]); }
export async function deleteDoc(ref) { await sleep(); run(ref.db, [{ type: "delete", path: ref.path }]); }
export function writeBatch(db) {
  const ops = [];
  const b = {
    set: (ref, data, opts) => { ops.push({ type: "set", path: ref.path, data, merge: !!(opts && opts.merge) }); return b; },
    update: (ref, data) => { ops.push({ type: "update", path: ref.path, data }); return b; },
    delete: (ref) => { ops.push({ type: "delete", path: ref.path }); return b; },
    commit: async () => { await sleep(); run(db, ops); }
  };
  return b;
}
