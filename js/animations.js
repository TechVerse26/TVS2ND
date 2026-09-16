// js/animations.js
// একটা মাত্র orchestrated মোশন প্যাটার্ন — স্ক্রল-রিভিল — পুরো সাইট জুড়ে ব্যবহৃত হয়েছে,
// আলাদা আলাদা এলিমেন্টে ছড়ানো র‍্যান্ডম ইফেক্ট এড়ানো হয়েছে।

export function initScrollReveal() {
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || items.length === 0) {
    items.forEach((el) => el.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  items.forEach((el) => io.observe(el));
}

export function animateCounters() {
  const cells = document.querySelectorAll("[data-count]");
  if (cells.length === 0) return;
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
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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
