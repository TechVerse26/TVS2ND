// tests/offline/firestore-sim.mjs
// ⚠️ অ-অফিশিয়াল: ইন-মেমরি Firestore + Security Rules সিমুলেটর (rules-engine.mjs ব্যবহার করে)।
// যা মডেল করা হয়েছে: get/list/count, create/update/delete, set(merge), writeBatch (atomic, getAfter/existsAfter),
// serverTimestamp/increment/arrayUnion/arrayRemove, equality-where + limit কোয়েরি ("rules ফিল্টার নয়" নিয়ম),
// document-access-call সীমা (প্রতি অপারেশনে ≤১০, batch-এ মোট ≤২০ — রিপিট কলও আলাদা গোনা, অর্থাৎ কড়া হিসাব)।
import { RulesEngine, RulesError, Ts, ConstraintMap, makeResource, eq } from "./rules-engine.mjs";

export class Sentinel { constructor(kind, v) { this.kind = kind; this.v = v; } }
export class FirestoreError extends Error { constructor(code, msg) { super(msg || code); this.code = code; } }

const isMap = (v) => v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype;
export function clone(v) {
  if (Array.isArray(v)) return v.map(clone);
  if (v instanceof Ts) return new Ts(v.ms);
  if (isMap(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)]));
  return v;
}

export class FirestoreSim {
  constructor(rulesText) {
    this.engine = new RulesEngine(rulesText);
    this.docs = new Map();
    this.stats = { maxOpCalls: 0, maxOpWhere: "", maxRequestCalls: 0, lint: new Set(), evalErrors: 0 };
  }
  clear() { this.docs.clear(); }

  /* ---- ডেটা-রূপান্তর ---- */
  resolve(existing, data, { merge = false, replace = false }, now) {
    const out = replace ? {} : clone(existing || {});
    for (const [k, v] of Object.entries(data)) {
      const cur = out[k];
      if (v instanceof Sentinel) {
        if (v.kind === "server") out[k] = new Ts(now);
        else if (v.kind === "inc") out[k] = (typeof cur === "number" ? cur : 0) + v.v;
        else if (v.kind === "union") { const a = Array.isArray(cur) ? [...cur] : []; for (const x of v.v) if (!a.some((y) => eq(x, y))) a.push(x); out[k] = a; }
        else if (v.kind === "remove") out[k] = (Array.isArray(cur) ? cur : []).filter((x) => !v.v.some((y) => eq(x, y)));
        else if (v.kind === "delete") delete out[k];
      } else out[k] = clone(v);
    }
    return out;
  }
  /** নিয়ম বাইপাস (withSecurityRulesDisabled) */
  seed(path, data) { this.docs.set(path, this.resolve(null, data, { replace: true }, Date.now())); }

  authObj(auth) {
    if (!auth) return null;
    return { uid: auth.uid, token: { sub: auth.uid, user_id: auth.uid, firebase: { sign_in_provider: "custom", identities: {} }, ...(auth.token || {}) } };
  }
  track(calls, where, allowed = true) { if (allowed && calls > this.stats.maxOpCalls) { this.stats.maxOpCalls = calls; this.stats.maxOpWhere = where; } }
  note(r) { for (const l of r.lint) this.stats.lint.add(l); if (r.errors.length) this.stats.evalErrors += r.errors.length; }
  deny(r, what) { const e = new FirestoreError("permission-denied", `PERMISSION_DENIED: ${what} — ${r.errors.join("; ") || "no allow rule matched"}`); e.detail = r; return e; }

  /* ---- একক ডক পড়া ---- */
  get(path, auth) {
    const now = Date.now(); const before = this.docs.get(path);
    const acc = { calls: 0 };
    const r = this.engine.authorize({
      method: "get", path,
      request: { auth: this.authObj(auth), time: new Ts(now), method: "get", resource: null },
      resource: before ? makeResource(clone(before), path.split("/").pop()) : null,
      db: { before: (p) => this.docs.get(p), after: (p) => this.docs.get(p) }, accessLimit: 10, acc
    });
    this.note(r); this.track(acc.calls, `get ${path}`);
    if (!r.allowed) throw this.deny(r, `get ${path}`);
    return { id: path.split("/").pop(), exists: () => !!before, data: () => (before ? clone(before) : undefined) };
  }

  /* ---- কোয়েরি (list / count) ---- */
  list(collPath, q, auth) {
    const now = Date.now(); const known = {};
    for (const w of q.where || []) if (w.op === "==") known[w.field] = w.value;
    const acc = { calls: 0 };
    const request = { auth: this.authObj(auth), time: new Ts(now), method: "list", resource: null, query: { offset: 0, ...(q.limit != null ? { limit: q.limit } : {}) } };
    const r = this.engine.authorize({
      method: "list", path: collPath + "/__query__", request,
      resource: makeResource(new ConstraintMap(known), null),
      db: { before: (p) => this.docs.get(p), after: (p) => this.docs.get(p) }, accessLimit: 10, acc
    });
    this.note(r); this.track(acc.calls, `list ${collPath}`);
    if (!r.allowed) throw this.deny(r, `list ${collPath}`);
    const depth = collPath.split("/").length + 1;
    let rows = [...this.docs.entries()].filter(([p]) => p.startsWith(collPath + "/") && p.split("/").length === depth);
    for (const w of q.where || []) if (w.op === "==") rows = rows.filter(([, d]) => eq(d[w.field], w.value));
    if (q.limit != null) rows = rows.slice(0, q.limit);
    return rows.map(([p, d]) => ({ id: p.split("/").pop(), exists: () => true, data: () => clone(d) }));
  }

  /* ---- লেখা (একক বা batch) ---- */
  commit(ops, auth, { noRules = false } = {}) {
    const now = Date.now();
    const plan = ops.map((o) => {
      const before = this.docs.get(o.path);
      let method, after;
      if (o.type === "delete") { method = "delete"; after = null; }
      else if (o.type === "update") { method = "update"; after = before ? this.resolve(before, o.data, {}, now) : null; }
      else { method = before ? "update" : "create"; after = this.resolve(before, o.data, o.merge ? {} : { replace: true }, now); }
      return { ...o, before, after, method };
    });
    if (noRules) { for (const p of plan) { if (p.after === null) this.docs.delete(p.path); else this.docs.set(p.path, p.after); } return; }
    const overlay = new Map(plan.map((p) => [p.path, p.after]));
    const db = { before: (p) => this.docs.get(p), after: (p) => (overlay.has(p) ? overlay.get(p) : this.docs.get(p)) };
    const total = { calls: 0 }; const multi = plan.length > 1;
    for (const p of plan) {
      const acc = { calls: 0 };
      const r = this.engine.authorize({
        method: p.method, path: p.path,
        request: { auth: this.authObj(auth), time: new Ts(now), method: p.method, resource: p.after ? makeResource(clone(p.after), p.path.split("/").pop()) : null },
        resource: p.before ? makeResource(clone(p.before), p.path.split("/").pop()) : null,
        db, accessLimit: 10, acc
      });
      this.note(r); total.calls += acc.calls;
      this.track(acc.calls, `${p.method} ${p.path}`, r.allowed);
      if (!r.allowed) throw this.deny(r, `${p.method} ${p.path}`);
      if (p.type === "update" && !p.before) throw new FirestoreError("not-found", "No document to update: " + p.path);
    }
    if (total.calls > (multi ? 20 : 10)) throw this.deny({ errors: [`request access-call limit exceeded (${total.calls} > ${multi ? 20 : 10})`] }, "commit");
    this.stats.maxRequestCalls = Math.max(this.stats.maxRequestCalls, total.calls);
    for (const p of plan) { if (p.after === null) this.docs.delete(p.path); else this.docs.set(p.path, p.after); }
  }
}
