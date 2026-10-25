// ব্যবহার:  node --import ./offline/register.mjs firestore.rules.test.mjs
import { register } from "node:module";
register("./hooks.mjs", import.meta.url);
