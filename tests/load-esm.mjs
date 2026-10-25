// tests/load-esm.mjs — ../js/*.js (শুধু-ডেটা ES-মডিউল, কোনো import নেই) নিরাপদে ইম্পোর্ট করে।
// কারণ: রুটে package.json ("type":"module") না থাকলে পুরোনো Node-এ ../js/x.js কে CommonJS ধরে ইম্পোর্ট ফেল করে।
// তাই সোর্স পড়ে data: URL মডিউল হিসেবে লোড করা হয় (সব Node ≥ 14.8-এ চলে)।
import { readFileSync } from "node:fs";

export async function loadEsm(relPath, base = import.meta.url) {
  const src = readFileSync(new URL(relPath, base), "utf8");
  if (/^\s*import\s/m.test(src)) throw new Error(`${relPath}-এ import আছে — load-esm.mjs শুধু import-মুক্ত ডেটা-মডিউলের জন্য`);
  return import("data:text/javascript;base64," + Buffer.from(src, "utf8").toString("base64"));
}
