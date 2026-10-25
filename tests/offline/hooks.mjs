// tests/offline/hooks.mjs — 'firebase/firestore' ও '@firebase/rules-unit-testing' ইমপোর্ট নকলে ঘুরিয়ে দেয়
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@firebase/rules-unit-testing") return { url: new URL("./mock-rules-unit-testing.mjs", import.meta.url).href, shortCircuit: true };
  if (specifier === "firebase/firestore") return { url: new URL("./mock-firestore.mjs", import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
