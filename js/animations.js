// js/animations.js
// মোশন এখন ইচ্ছাকৃতভাবে কম: শুধু (১) হিরো টার্মিনালের টাইপিং — পেজে ঢোকার একমাত্র "মুহূর্ত",
// আর (২) স্ট্যাটস কাউন্টার যখন ভিউপোর্টে আসে। বাকি সব মোশন ইউজারের অ্যাকশনের উত্তরে
// (ড্রয়ার খোলা, ট্যাব বদল, অ্যাকর্ডিয়ন) — সেগুলো CSS-এ।

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function animateCounters() {
  const cells = document.querySelectorAll("[data-count]");
  if (cells.length === 0) return;

  const finish = (el) => {
    el.textContent = Math.round(parseFloat(el.dataset.count)) + (el.dataset.suffix || "");
  };
  if (reducedMotion() || !("IntersectionObserver" in window)) {
    cells.forEach(finish);
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const target = parseFloat(el.dataset.count);
        const suffix = el.dataset.suffix || "";
        const dur = 1100;
        const start = performance.now();
        function tick(now) {
          const p = Math.min(1, (now - start) / dur);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(target * eased) + suffix;
          if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
        io.unobserve(el);
      });
    },
    { threshold: 0.4 }
  );
  cells.forEach((el) => io.observe(el));
}

const terminalLines = [
  { text: "$ techverse deploy --project client-app", cls: "" },
  { text: "  ▸ building pure JS/CSS bundle...", cls: "c" },
  { text: "  ▸ firebase auth: email, google, github", cls: "s" },
  { text: "  ▸ pwa: offline support enabled", cls: "s" },
  { text: "✓ deployed in 3.2s", cls: "s" }
];

export function initHeroTerminal(bodyEl) {
  if (!bodyEl) return;
  if (reducedMotion()) {
    bodyEl.innerHTML = terminalLines
      .map((l) => `<div class="terminal-line ${l.cls}">${l.text}</div>`)
      .join("");
    return;
  }
  bodyEl.innerHTML = "";
  let li = 0;
  function typeLine() {
    if (li >= terminalLines.length) {
      const cursor = document.createElement("span");
      cursor.className = "terminal-cursor";
      bodyEl.appendChild(cursor);
      return;
    }
    const line = terminalLines[li];
    const row = document.createElement("div");
    row.className = `terminal-line ${line.cls}`;
    bodyEl.appendChild(row);
    let ci = 0;
    const speed = 16;
    (function typeChar() {
      if (ci <= line.text.length) {
        row.textContent = line.text.slice(0, ci);
        ci++;
        setTimeout(typeChar, speed);
      } else {
        li++;
        setTimeout(typeLine, 220);
      }
    })();
  }
  typeLine();
}
