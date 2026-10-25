// tests/offline/rules-engine.mjs
// ⚠️ অ-অফিশিয়াল: Firestore Security Rules ভাষার একটা ছোট interpreter — শুধু firestore.rules-এ ব্যবহৃত অংশটুকু।
// উদ্দেশ্য: Java/Emulator ছাড়া (যেমন Termux-এ বা অফলাইনে) একই tests/scenarios.mjs দ্রুত চালানো।
// এটা অফিশিয়াল Emulator-এর বিকল্প নয় — ডিপ্লয়ের আগে `npm test` (Emulator) চালানোই চূড়ান্ত যাচাই।
// অসমর্থিত কোনো ফাংশন/সিনট্যাক্স পেলে চুপচাপ ধরে না নিয়ে Unsupported ছুঁড়ে — যাতে ভুল আত্মবিশ্বাস না আসে।

export class RulesError extends Error {}      // মূল্যায়ন-এরর (null-deref, টাইপ-মিসম্যাচ...) ⇒ সেই allow বাতিল
export class Unsupported extends Error {}     // আমার interpreter যা জানে না

/* ------------------------------------------------------------------ মান-ধরন */
export class Ts { constructor(ms) { this.ms = ms; } }
class RPath { constructor(segs) { this.segs = segs; } }
class RSet { constructor(items) { this.items = []; for (const x of items) if (!this.items.some((y) => eq(x, y))) this.items.push(x); } }
class RResource { constructor(data, id) { this.data = data; this.id = id; } }
class RMapDiff {
  constructor(a, b) { this.a = a; this.b = b; }
  added() { return Object.keys(this.a).filter((k) => !(k in this.b)); }
  removed() { return Object.keys(this.b).filter((k) => !(k in this.a)); }
  changed() { return Object.keys(this.a).filter((k) => k in this.b && !eq(this.a[k], this.b[k])); }
  unchanged() { return Object.keys(this.a).filter((k) => k in this.b && eq(this.a[k], this.b[k])); }
}
// list-কোয়েরিতে resource.data: শুধু equality-ফিল্টারে বাঁধা ফিল্ড জানা; বাকি ফিল্ডে হাত দিলে এরর (rules ফিল্টার নয়)
export class ConstraintMap { constructor(known) { this.known = known; } }

const isPlainMap = (v) => v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype;
export function eq(a, b) {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (a instanceof Ts && b instanceof Ts) return a.ms === b.ms;
  if (a instanceof RPath && b instanceof RPath) return a.segs.join("/") === b.segs.join("/");
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => eq(x, b[i]));
  if (isPlainMap(a) && isPlainMap(b)) { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every((k) => k in b && eq(a[k], b[k])); }
  return false;
}
const typeName = (v) => v === null ? "null" : Array.isArray(v) ? "list" : v instanceof RSet ? "set" : v instanceof Ts ? "timestamp" : v instanceof RPath ? "path"
  : typeof v === "number" ? (Number.isInteger(v) ? "int" : "float") : typeof v === "string" ? "string" : typeof v === "boolean" ? "bool" : isPlainMap(v) ? "map" : "other";

/* ------------------------------------------------------------------ lexer */
const KEYWORD_BEFORE_VALUE = new Set(["return", "match", "in", "if", "is", "allow", "let"]);
function lex(src) {
  const toks = []; let i = 0, line = 1; const n = src.length; let prev = null;
  const push = (t) => { t.line = line; toks.push(t); prev = t; };
  const operandEnd = (t) => t && ((t.t === "id" && !KEYWORD_BEFORE_VALUE.has(t.v)) || t.t === "num" || t.t === "str" || t.t === "path" || (t.t === "p" && (t.v === ")" || t.v === "]")));
  while (i < n) {
    const c = src[i];
    if (c === "\n") { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { const j = src.indexOf("*/", i + 2); if (j < 0) throw new Error("unterminated comment"); line += (src.slice(i, j).match(/\n/g) || []).length; i = j + 2; continue; }
    if (c === "/" && !operandEnd(prev)) { // path literal
      let j = i; const parts = [];
      while (j < n) {
        const ch = src[j];
        if (ch === "$" && src[j + 1] === "(") {
          let depth = 0, k = j + 1;
          for (; k < n; k++) { if (src[k] === "(") depth++; else if (src[k] === ")") { depth--; if (depth === 0) break; } }
          parts.push({ expr: src.slice(j + 2, k) }); j = k + 1; continue;
        }
        if (ch === "{") { const k = src.indexOf("}", j); parts.push({ lit: src.slice(j, k + 1) }); j = k + 1; continue; }
        if (/[A-Za-z0-9_\-./=*]/.test(ch)) { parts.push({ lit: ch }); j++; continue; }
        break;
      }
      const merged = []; for (const p of parts) { if (p.lit !== undefined && merged.length && merged[merged.length - 1].lit !== undefined) merged[merged.length - 1].lit += p.lit; else merged.push({ ...p }); }
      push({ t: "path", parts: merged }); i = j; continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1, s = "";
      while (j < n && src[j] !== c) { if (src[j] === "\\") { const e = src[j + 1]; s += e === "n" ? "\n" : e === "t" ? "\t" : e; j += 2; } else s += src[j++]; }
      push({ t: "str", v: s }); i = j + 1; continue;
    }
    if (/[0-9]/.test(c)) { let j = i; while (j < n && /[0-9.]/.test(src[j])) j++; push({ t: "num", v: Number(src.slice(i, j)) }); i = j; continue; }
    if (/[A-Za-z_]/.test(c)) { let j = i; while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++; push({ t: "id", v: src.slice(i, j) }); i = j; continue; }
    const two = src.slice(i, i + 2);
    if (["&&", "||", "==", "!=", "<=", ">="].includes(two)) { push({ t: "p", v: two }); i += 2; continue; }
    if ("()[]{},;:.?!<>+-*/%=".includes(c)) { push({ t: "p", v: c }); i++; continue; }
    throw new Error(`lex: unexpected '${c}' at line ${line}`);
  }
  return toks;
}

/* ------------------------------------------------------------------ parser */
class Parser {
  constructor(toks) { this.toks = toks; this.i = 0; }
  peek(o = 0) { return this.toks[this.i + o]; }
  next() { return this.toks[this.i++]; }
  isP(v, o = 0) { const t = this.peek(o); return t && t.t === "p" && t.v === v; }
  isId(v, o = 0) { const t = this.peek(o); return t && t.t === "id" && t.v === v; }
  eatP(v) { if (!this.isP(v)) throw new Error(`parse: expected '${v}' at line ${this.peek()?.line} got ${JSON.stringify(this.peek())}`); return this.next(); }
  eatId(v) { if (!this.isId(v)) throw new Error(`parse: expected '${v}' at line ${this.peek()?.line}`); return this.next(); }

  parseFile() {
    if (this.isId("rules_version")) { this.next(); this.eatP("="); this.next(); this.eatP(";"); }
    this.eatId("service"); while (!this.isP("{")) this.next(); this.eatP("{");
    const body = this.parseBody(); this.eatP("}");
    return body;
  }
  parseBody() {
    const node = { matches: [], functions: {}, allows: [] };
    while (!this.isP("}") && this.peek()) {
      if (this.isId("match")) {
        this.next(); const pt = this.next(); if (pt.t !== "path") throw new Error("parse: match path expected at line " + pt.line);
        this.eatP("{"); const child = this.parseBody(); this.eatP("}");
        child.pattern = pt.parts.map((p) => p.lit).join(""); child.line = pt.line; node.matches.push(child);
      } else if (this.isId("function")) {
        this.next(); const name = this.next().v; this.eatP("("); const params = [];
        while (!this.isP(")")) { params.push(this.next().v); if (this.isP(",")) this.next(); }
        this.eatP(")"); this.eatP("{"); const stmts = [];
        while (!this.isP("}")) {
          if (this.isId("let")) { this.next(); const nm = this.next().v; this.eatP("="); const e = this.parseExpr(); this.eatP(";"); stmts.push({ k: "let", nm, e }); }
          else if (this.isId("return")) { this.next(); const e = this.parseExpr(); this.eatP(";"); stmts.push({ k: "ret", e }); }
          else throw new Error("parse: bad function stmt at line " + this.peek().line);
        }
        this.eatP("}"); node.functions[name] = { name, params, stmts };
      } else if (this.isId("allow")) {
        const line = this.next().line; const ops = [];
        do { ops.push(this.next().v); } while (this.isP(",") && this.next());
        let cond = { t: "bool", v: true };
        if (this.isP(":")) { this.next(); this.eatId("if"); cond = this.parseExpr(); }
        this.eatP(";"); node.allows.push({ ops, cond, line });
      } else throw new Error("parse: unexpected token at line " + this.peek().line + ": " + JSON.stringify(this.peek()));
    }
    return node;
  }

  parseExpr() { return this.parseTernary(); }
  parseTernary() {
    const c = this.parseOr();
    if (this.isP("?")) { this.next(); const a = this.parseTernary(); this.eatP(":"); const b = this.parseTernary(); return { t: "cond", c, a, b }; }
    return c;
  }
  parseOr() { let l = this.parseAnd(); while (this.isP("||")) { const line = this.next().line; l = { t: "or", l, r: this.parseAnd(), line }; } return l; }
  parseAnd() { let l = this.parseEq(); while (this.isP("&&")) { const line = this.next().line; l = { t: "and", l, r: this.parseEq(), line }; } return l; }
  parseEq() { let l = this.parseRel(); while (this.isP("==") || this.isP("!=")) { const op = this.next().v; l = { t: "bin", op, l, r: this.parseRel() }; } return l; }
  parseRel() {
    let l = this.parseAdd();
    for (;;) {
      if (this.isP("<") || this.isP(">") || this.isP("<=") || this.isP(">=")) { const op = this.next().v; l = { t: "bin", op, l, r: this.parseAdd() }; }
      else if (this.isId("in")) { this.next(); l = { t: "in", l, r: this.parseAdd() }; }
      else if (this.isId("is")) { this.next(); l = { t: "is", l, ty: this.next().v }; }
      else return l;
    }
  }
  parseAdd() { let l = this.parseMul(); while (this.isP("+") || this.isP("-")) { const op = this.next().v; l = { t: "bin", op, l, r: this.parseMul() }; } return l; }
  parseMul() { let l = this.parseUnary(); while (this.isP("*") || this.isP("/") || this.isP("%")) { const op = this.next().v; l = { t: "bin", op, l, r: this.parseUnary() }; } return l; }
  parseUnary() {
    if (this.isP("!")) { this.next(); return { t: "not", e: this.parseUnary() }; }
    if (this.isP("-")) { this.next(); return { t: "neg", e: this.parseUnary() }; }
    return this.parsePostfix();
  }
  parsePostfix() {
    let e = this.parsePrimary();
    for (;;) {
      if (this.isP(".")) { this.next(); const name = this.next().v; if (this.isP("(")) { e = { t: "mcall", obj: e, name, args: this.parseArgs(), line: this.peek(-1)?.line }; } else e = { t: "member", obj: e, name }; }
      else if (this.isP("(") && e.t === "id") { e = { t: "call", name: e.name, args: this.parseArgs(), line: e.line }; }
      else if (this.isP("[")) { this.next(); const idx = this.parseExpr(); if (this.isP(":")) throw new Unsupported("slice"); this.eatP("]"); e = { t: "index", obj: e, idx }; }
      else return e;
    }
  }
  parseArgs() { this.eatP("("); const a = []; while (!this.isP(")")) { a.push(this.parseExpr()); if (this.isP(",")) this.next(); } this.eatP(")"); return a; }
  parsePrimary() {
    const t = this.next();
    if (!t) throw new Error("parse: unexpected end");
    if (t.t === "num") return { t: "num", v: t.v };
    if (t.t === "str") return { t: "str", v: t.v };
    if (t.t === "path") return { t: "path", parts: t.parts.map((p) => (p.expr !== undefined ? { expr: parseExprString(p.expr) } : p)) };
    if (t.t === "id") {
      if (t.v === "true") return { t: "bool", v: true };
      if (t.v === "false") return { t: "bool", v: false };
      if (t.v === "null") return { t: "null" };
      return { t: "id", name: t.v, line: t.line };
    }
    if (t.t === "p" && t.v === "(") { const e = this.parseExpr(); this.eatP(")"); return e; }
    if (t.t === "p" && t.v === "[") { const items = []; while (!this.isP("]")) { items.push(this.parseExpr()); if (this.isP(",")) this.next(); } this.eatP("]"); return { t: "list", items }; }
    if (t.t === "p" && t.v === "{") throw new Unsupported("map literal");
    throw new Error(`parse: unexpected '${t.v}' at line ${t.line}`);
  }
}
const parseExprString = (s) => { const p = new Parser(lex(s)); return p.parseExpr(); };

/* ------------------------------------------------------------------ evaluator */
const MAX_DEPTH = 20;
class Evaluator {
  constructor(engine, ctx) { this.engine = engine; this.ctx = ctx; this.depth = 0; }
  fail(msg) { throw new RulesError(msg); }
  tick() { if (++this.ctx.acc.calls > this.ctx.accessLimit) this.fail(`document access limit exceeded (${this.ctx.accessLimit})`); }

  ev(n, env) {
    switch (n.t) {
      case "num": case "str": case "bool": return n.v;
      case "null": return null;
      case "list": return n.items.map((x) => this.ev(x, env));
      case "id": return this.lookup(n, env);
      case "path": return this.evPath(n, env);
      case "not": { const v = this.ev(n.e, env); if (typeof v !== "boolean") this.fail("! on non-bool"); return !v; }
      case "neg": { const v = this.ev(n.e, env); if (typeof v !== "number") this.fail("- on non-number"); return -v; }
      case "and": { const l = this.boolOf(n.l, env, n.line, "&&"); if (!l) return false; return this.boolOf(n.r, env, n.line, "&&"); }
      // '||': শুধু বাম অপারেন্ডের এরর লিন্ট হয় (CEL-ধাঁচের evaluator-এ `error || true` = true হতে পারে); ডান অপারেন্ডে এরর = সব evaluator-এই এরর
      case "or": { const l = this.boolOf(n.l, env, n.line, "||"); if (l) return true; return this.boolOf(n.r, env, n.line, "&&"); }
      case "cond": { const c = this.ev(n.c, env); if (typeof c !== "boolean") this.fail("?: non-bool"); return c ? this.ev(n.a, env) : this.ev(n.b, env); }
      case "in": return this.evIn(this.ev(n.l, env), this.ev(n.r, env));
      case "is": return this.evIs(this.ev(n.l, env), n.ty);
      case "bin": return this.evBin(n.op, this.ev(n.l, env), this.ev(n.r, env));
      case "member": return this.evMember(this.ev(n.obj, env), n.name);
      case "index": return this.evIndex(this.ev(n.obj, env), this.ev(n.idx, env));
      case "call": return this.evCall(n, env);
      case "mcall": return this.evMethod(this.ev(n.obj, env), n.name, n.args.map((a) => this.ev(a, env)));
      default: throw new Unsupported("node " + n.t);
    }
  }
  boolOf(node, env, line, op) {
    let v;
    try { v = this.ev(node, env); }
    catch (e) { if (e instanceof RulesError && op === "||") this.ctx.lint.push(`line ${line}: '||'-এর অপারেন্ডে এরর (${e.message}) — অফিশিয়াল evaluator-এ আচরণ আলাদা হতে পারে`); throw e; }
    if (typeof v !== "boolean") this.fail(`${op} on non-bool (${typeName(v)})`);
    return v;
  }
  lookup(n, env) {
    for (let e = env; e; e = e.parent) if (n.name in e.vars) return e.vars[n.name];
    const g = this.ctx.globals;
    if (n.name in g) return g[n.name];
    // ব্যবহারকারী-ফাংশন নাম (প্যারামিটার ছাড়া) নয় — অজানা শনাক্তকারী
    this.fail("unknown identifier " + n.name);
  }
  evPath(n, env) {
    const segs = [];
    for (const p of n.parts) {
      if (p.lit !== undefined) segs.push(...p.lit.split("/").filter(Boolean));
      else { const v = this.ev(p.expr, env); if (typeof v !== "string") this.fail("path interpolation of non-string"); if (v.includes("/") || v === "") { segs.push(...v.split("/")); } else segs.push(v); }
    }
    return new RPath(segs);
  }
  evIn(l, r) {
    if (Array.isArray(r)) return r.some((x) => eq(x, l));
    if (r instanceof RSet) return r.items.some((x) => eq(x, l));
    if (isPlainMap(r)) { if (typeof l !== "string") this.fail("map key must be string"); return l in r; }
    this.fail("in on " + typeName(r));
  }
  evIs(v, ty) {
    switch (ty) {
      case "string": case "bool": case "list": case "map": case "int": case "float": case "path": case "set": case "timestamp": return typeName(v) === ty;
      case "number": return typeof v === "number";
      default: throw new Unsupported("is " + ty);
    }
  }
  evBin(op, a, b) {
    if (op === "==") return eq(a, b);
    if (op === "!=") return !eq(a, b);
    if (op === "+") { if (typeof a === "number" && typeof b === "number") return a + b; if (typeof a === "string" && typeof b === "string") return a + b; this.fail("+ type mismatch " + typeName(a) + "," + typeName(b)); }
    if (op === "-") { if (typeof a === "number" && typeof b === "number") return a - b; this.fail("- type mismatch"); }
    if (op === "*" || op === "/" || op === "%") throw new Unsupported("arith " + op);
    // < <= > >=
    let x, y;
    if (typeof a === "number" && typeof b === "number") { x = a; y = b; }
    else if (typeof a === "string" && typeof b === "string") { x = a; y = b; }
    else if (a instanceof Ts && b instanceof Ts) { x = a.ms; y = b.ms; }
    else this.fail(`${op} type mismatch ${typeName(a)},${typeName(b)}`);
    return op === "<" ? x < y : op === ">" ? x > y : op === "<=" ? x <= y : x >= y;
  }
  evMember(o, name) {
    if (o === null || o === undefined) this.fail("member of null: ." + name);
    if (o instanceof RResource) { if (name === "data") return o.data; if (name === "id") return o.id; this.fail("resource." + name); }
    if (o instanceof ConstraintMap) { if (name in o.known) return o.known[name]; this.fail("query does not constrain field " + name); }
    if (isPlainMap(o)) { if (name in o) return o[name]; this.fail("missing key " + name); }
    this.fail("member access on " + typeName(o));
  }
  evIndex(o, i) {
    if (Array.isArray(o)) { if (typeof i !== "number" || i < 0 || i >= o.length) this.fail("index out of range"); return o[i]; }
    if (isPlainMap(o)) { if (typeof i !== "string" || !(i in o)) this.fail("missing key"); return o[i]; }
    this.fail("index on " + typeName(o));
  }
  evCall(n, env) {
    const args = () => n.args.map((a) => this.ev(a, env));
    switch (n.name) {
      case "get": case "getAfter": case "exists": case "existsAfter": {
        const [p] = args(); if (!(p instanceof RPath)) this.fail(n.name + " needs a path");
        this.tick();
        const after = n.name.endsWith("After");
        const rel = this.engine.relPath(p.segs);
        const doc = after ? this.ctx.db.after(rel) : this.ctx.db.before(rel);
        if (n.name === "exists" || n.name === "existsAfter") return doc !== null && doc !== undefined;
        if (doc === null || doc === undefined) this.fail("document not found: " + rel);
        return new RResource(doc, rel.split("/").pop());
      }
      case "debug": return args()[0];
    }
    const fn = this.engine.findFunction(n.name, this.ctx.chain);
    if (!fn) throw new Unsupported("function " + n.name);
    if (++this.depth > MAX_DEPTH) this.fail("function call depth exceeded");
    try {
      const vals = args();
      const fenv = { vars: {}, parent: this.engine.scopeEnv(fn.owner, this.ctx.wild) };
      fn.def.params.forEach((p, i) => { fenv.vars[p] = vals[i]; });
      for (const st of fn.def.stmts) {
        if (st.k === "let") fenv.vars[st.nm] = this.ev(st.e, fenv);
        else return this.ev(st.e, fenv);
      }
      this.fail("function without return: " + n.name);
    } finally { this.depth--; }
  }
  evMethod(o, name, a) {
    if (o === null || o === undefined) this.fail("method on null: " + name);
    if (typeof o === "string") {
      switch (name) {
        case "size": return [...o].length;
        case "matches": { if (typeof a[0] !== "string") this.fail("matches arg"); return new RegExp("^(?:" + a[0] + ")$", "u").test(o); }
        case "lower": return o.toLowerCase();
        case "upper": return o.toUpperCase();
        case "split": return o.split(new RegExp(a[0]));
      }
      throw new Unsupported("string." + name);
    }
    if (Array.isArray(o) || o instanceof RSet) {
      const items = Array.isArray(o) ? o : o.items;
      const other = (x) => { if (Array.isArray(x)) return x; if (x instanceof RSet) return x.items; this.fail("set arg must be list/set"); };
      switch (name) {
        case "size": return items.length;
        case "hasAll": return other(a[0]).every((x) => items.some((y) => eq(x, y)));
        case "hasAny": return other(a[0]).some((x) => items.some((y) => eq(x, y)));
        case "hasOnly": return items.every((x) => other(a[0]).some((y) => eq(x, y)));
      }
      throw new Unsupported((Array.isArray(o) ? "list." : "set.") + name);
    }
    if (o instanceof RMapDiff) {
      switch (name) {
        case "affectedKeys": return new RSet([...o.added(), ...o.removed(), ...o.changed()]);
        case "addedKeys": return new RSet(o.added());
        case "removedKeys": return new RSet(o.removed());
        case "changedKeys": return new RSet(o.changed());
        case "unchangedKeys": return new RSet(o.unchanged());
      }
      throw new Unsupported("MapDiff." + name);
    }
    if (isPlainMap(o)) {
      switch (name) {
        case "get": return a[0] in o ? o[a[0]] : a[1];
        case "keys": return Object.keys(o);
        case "size": return Object.keys(o).length;
        case "diff": { if (!isPlainMap(a[0])) this.fail("diff arg"); return new RMapDiff(o, a[0]); }
      }
      throw new Unsupported("map." + name);
    }
    if (o instanceof ConstraintMap) {
      if (name === "get") { if (a[0] in o.known) return o.known[a[0]]; this.fail("query does not constrain field " + a[0]); }
      throw new Unsupported("constraint-map." + name);
    }
    throw new Unsupported(typeName(o) + "." + name);
  }
}

/* ------------------------------------------------------------------ engine */
export class RulesEngine {
  constructor(text) {
    this.text = text;
    this.root = new Parser(lex(text)).parseFile();
    // রুট = /databases/{database}/documents
    if (this.root.matches.length !== 1 || !/^\/databases\/\{database\}\/documents$/.test(this.root.matches[0].pattern)) throw new Error("expected single top-level match /databases/{database}/documents");
    this.doc = this.root.matches[0];
    this.index(this.doc, null);
    this.knownFunctions = Object.keys(this.doc.functions);
  }
  index(node, parent) { node.parent = parent; for (const m of node.matches) this.index(m, node); }
  relPath(segs) { // [databases, X, documents, ...rest] → "rest/..."
    if (segs[0] !== "databases" || segs[2] !== "documents") throw new RulesError("bad path root");
    return segs.slice(3).join("/");
  }
  findFunction(name, chain) {
    for (let i = chain.length - 1; i >= 0; i--) if (chain[i].functions[name]) return { def: chain[i].functions[name], owner: chain[i] };
    return null;
  }
  scopeEnv(owner, wild) { // owner-ম্যাচ ও তার পূর্বপুরুষদের ওয়াইল্ডকার্ড
    let env = null; const chain = []; for (let n = owner; n; n = n.parent) chain.unshift(n);
    for (const n of chain) env = { vars: { ...(wild.get(n) || {}) }, parent: env };
    return env;
  }
  // doc-পাথ (যেমন "tvProject/main/users/u1") ধরে ম্যাচ-চেইন ও allow-তালিকা
  matchAll(relSegs) {
    const out = [];
    const walk = (node, rest, chain, wild) => {
      for (const child of node.matches) {
        const segsPat = child.pattern.split("/").filter(Boolean);
        let pos = 0; const cap = {}; let ok = true; let consumedAll = false;
        for (const sp of segsPat) {
          const m = /^\{([A-Za-z_][A-Za-z0-9_]*)(=\*\*)?\}$/.exec(sp);
          if (m && m[2]) { cap[m[1]] = new RPath(rest.slice(pos)); pos = rest.length; consumedAll = true; continue; }
          if (pos >= rest.length) { ok = false; break; }
          if (m) cap[m[1]] = rest[pos++]; else if (sp === rest[pos]) pos++; else { ok = false; break; }
        }
        if (!ok) continue;
        const w2 = new Map(wild); w2.set(child, cap); const c2 = [...chain, child];
        const remaining = rest.slice(pos);
        if (remaining.length === 0) out.push({ node: child, chain: c2, wild: w2 });
        if (!consumedAll && remaining.length > 0) walk(child, remaining, c2, w2);
      }
    };
    const rootWild = new Map(); rootWild.set(this.doc, { database: "(default)" });
    // doc-নোডের নিজের allow (পাথ খালি) প্রযোজ্য নয়; ভেতরের match-গুলো হাঁটি
    walk(this.doc, relSegs, [this.root, this.doc], rootWild);
    return out;
  }
  /** method: get|list|create|update|delete — returns {allowed, by, errors, lint, calls} */
  authorize({ method, path, request, resource, db, accessLimit = 10, acc = { calls: 0 } }) {
    const rel = path.split("/").filter(Boolean);
    const matches = this.matchAll(rel);
    const lint = []; const errors = []; let allowedBy = null;
    const opSet = (ops) => { const s = new Set(); for (const o of ops) { if (o === "read") { s.add("get"); s.add("list"); } else if (o === "write") { s.add("create"); s.add("update"); s.add("delete"); } else s.add(o); } return s; };
    outer: for (const m of matches) {
      for (const al of m.node.allows) {
        if (!opSet(al.ops).has(method)) continue;
        const globals = { request, resource, database: "(default)", ...Object.fromEntries([...m.wild.values()].flatMap((o) => Object.entries(o))) };
        const ctx = { request, resource, globals, db, accessLimit, acc, lint, chain: m.chain, wild: m.wild };
        const ev = new Evaluator(this, ctx);
        try {
          const v = ev.ev(al.cond, { vars: {}, parent: null });
          if (v === true) { allowedBy = `line ${al.line}`; break outer; }
        } catch (e) {
          if (e instanceof RulesError) errors.push(`line ${al.line}: ${e.message}`);
          else throw e; // Unsupported / বাগ — চেপে যাওয়া নয়
        }
      }
    }
    return { allowed: allowedBy !== null, by: allowedBy, errors, lint, calls: acc.calls };
  }
}
export const makeResource = (data, id) => new RResource(data, id);
