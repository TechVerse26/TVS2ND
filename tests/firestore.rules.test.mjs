// tests/firestore.rules.test.mjs
// firestore.rules যাচাই — tests/scenarios.mjs-এর প্রতিটা সিনারিও এখানে চলে।
//   • অফিশিয়াল Firebase Emulator-এ (ডিপ্লয়ের আগে এটাই চূড়ান্ত যাচাই):  cd tests && npm install && npm test   (Java ১১+ লাগে)
//   • Java/Emulator ছাড়া দ্রুত, অ-অফিশিয়াল সিমুলেটরে:                    cd tests && npm run test:offline
import { readFileSync } from "node:fs";
import { describe, it, before, after, beforeEach } from "node:test";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { scenarios } from "./scenarios.mjs";
import { resetAndSeed, executeScenario } from "./harness.mjs";

const RULES = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
let env;

before(async () => { env = await initializeTestEnvironment({ projectId: "tv-rules-test", firestore: { rules: RULES } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await resetAndSeed(env); });

for (const group of [...new Set(scenarios.map((s) => s.group))]) {
  describe(group, () => {
    for (const sc of scenarios.filter((s) => s.group === group)) {
      it(`${sc.ok ? "ALLOW" : "DENY "}  ${sc.name}`, async (t) => {
        if (sc.simOnly && !env._sim) return t.skip("শুধু অফলাইন সিমুলেটরের জন্য (অফিশিয়াল Emulator-এ access-call ক্যাশিং ভিন্ন হতে পারে)");
        await executeScenario(env, sc);
      });
    }
  });
}
