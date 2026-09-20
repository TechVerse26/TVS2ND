// js/toast.js
// ছোট নোটিফিকেশন — সফল হলে সবুজ টিক, সমস্যা হলে লাল সতর্কতা আইকন।
// মেসেজ সবসময় textContent দিয়ে বসানো হয় (HTML হিসেবে নয়)।
import { icons } from "./icons.js";

let stack;

function ensureStack() {
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    stack.setAttribute("role", "status");
    stack.setAttribute("aria-live", "polite");
    document.body.appendChild(stack);
  }
  return stack;
}

export function showToast(message, type = "success", duration = 3800) {
  const el = document.createElement("div");
  el.className = `toast${type === "error" ? " error" : ""}`;

  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.innerHTML = type === "error" ? icons.warn : icons.check;

  const text = document.createElement("span");
  text.textContent = message;

  el.append(icon, text);
  ensureStack().appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 260);
  }, duration);
}
