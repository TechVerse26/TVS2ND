// js/icons.js
// একক আইকন লাইব্রেরি — পাবলিক সাইট (templates.js) ও অ্যাডমিন প্যানেল (admin.js) দুটোই
// এখান থেকে আইকন নেয়, যাতে পুরো প্রজেক্টে একই স্টাইলের (স্ট্রোক-বেজড, ২৪x২৪) আইকন থাকে।
// নতুন সার্ভিস যোগ করার সময় admin প্যানেলে এই তালিকা থেকেই বেছে নেওয়া যাবে।

// ছোট হেল্পার — নতুন আইকনগুলো একই স্ট্রোক-স্টাইলে (২৪x২৪, রাউন্ড এন্ড) বানাতে
const s = (body, extra = "") =>
  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ${extra}>${body}</svg>`;

export const icons = {
  code: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 6 2 12l6 6M16 6l6 6-6 6"/></svg>',
  device: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M11 18h2"/></svg>',
  server: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><circle cx="7" cy="7" r=".6" fill="currentColor"/><circle cx="7" cy="17" r=".6" fill="currentColor"/></svg>',
  layout: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
  link: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
  shield: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg>',
  settings: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h10M17 6h3M4 12h3M9 12h11M4 18h13M20 18h0"/><circle cx="14" cy="6" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="16" cy="18" r="2"/></svg>',
  chart: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V10M12 20V4M20 20v-7"/><path d="M2 20h20"/></svg>',
  globe: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.5 4 5.7 4 9s-1.4 6.5-4 9c-2.6-2.5-4-5.7-4-9s1.4-6.5 4-9Z"/></svg>',
  lock: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  message: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H10l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/></svg>',
  search: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10" cy="10" r="6.5"/><path d="M20 20l-5.5-5.5"/></svg>',
  bolt: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></svg>',
  target: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg>',
  rocket: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 2c3 2.2 5 6.2 5 10 0 2-1 4.3-2 5.4l-1 3.1-2-2.2-2 2.2-1-3.1c-1-1.1-2-3.4-2-5.4 0-3.8 2-7.8 5-10Z"/><circle cx="12" cy="10.5" r="1.6" fill="currentColor" stroke="none"/><path d="M9.5 17.5 7 20M14.5 17.5 17 20"/></svg>',
  book: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 5.5c2.8-1.3 5.7-1.3 8 0 2.3-1.3 5.2-1.3 8 0V18c-2.8-1.3-5.7-1.3-8 0-2.3-1.3-5.2-1.3-8 0Z"/><path d="M12 5.5V18"/></svg>',

  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  arrow: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',

  edit: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  trash: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 7h16"/><path d="M9 7V4h6v3M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>',
  up: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 15l7-7 7 7"/></svg>',
  down: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 9l7 7 7-7"/></svg>',
  users: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.4 2.7-6 6-6s6 2.6 6 6"/><path d="M15.5 14.3c2.6.5 4.5 2.9 4.5 5.7"/><circle cx="16.2" cy="8.4" r="2.4"/></svg>',
  logout: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>',
  dashboard: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/></svg>',
  inbox: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12h5l1.5 3h5L16 12h5"/><rect x="3" y="6" width="18" height="14" rx="2"/></svg>',
  back: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  image: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5.5-5.5L4 21"/></svg>',
  seed: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22c5-1 8-5 8-10V6l-8-3-8 3v6c0 5 3 9 8 10Z"/><path d="M12 8v7M9 12l3-3 3 3"/></svg>',
  warn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 3 2 20h20L12 3Z" stroke-linejoin="round"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".4" fill="currentColor"/></svg>',
  close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  menu: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',

  // ---- প্রোফাইল স্লাইডার ও নতুন ডিজাইনের আইকন ----
  user: s('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>'),
  userFill: s('<circle cx="12" cy="8" r="4.2" fill="currentColor" stroke="none"/><path d="M4 21c0-4.2 3.6-7 8-7s8 2.8 8 7c0 .6-.4 1-1 1H5c-.6 0-1-.4-1-1Z" fill="currentColor" stroke="none"/>'),
  camera: s('<path d="M4 8h3l1.6-2.4h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.6"/>'),
  pencil: s('<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="M14.5 7.5l3 3"/>'),
  cap: s('<path d="M2 9l10-5 10 5-10 5L2 9Z" fill="currentColor" stroke-width="1.4"/><path d="M6 11.6V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.4"/><path d="M22 9v6"/>'),
  play: s('<path d="M8 5.2v13.6L19.2 12 8 5.2Z" fill="currentColor"/>'),
  bars: s('<rect x="3.5" y="12" width="4.6" height="8.5" rx="1.3" fill="currentColor" stroke="none"/><rect x="9.7" y="7.5" width="4.6" height="13" rx="1.3" fill="currentColor" stroke="none"/><rect x="15.9" y="3" width="4.6" height="17.5" rx="1.3" fill="currentColor" stroke="none"/>'),
  checkDisc: s('<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="M7.6 12.4l3 3 5.8-6.4" style="stroke:var(--t-badge, #fff)" stroke-width="2.2"/>'),
  chevronRight: s('<path d="M9 5l7 7-7 7"/>', 'stroke-width="2.2"'),
  chevronLeft: s('<path d="M15 5l-7 7 7 7"/>', 'stroke-width="2.2"'),
  external: s('<path d="M7 17 17 7M9 7h8v8"/>', 'stroke-width="2"'),
  sun: s('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: s('<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"/>'),
  monitor: s('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
  eye: s('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: s('<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4"/><path d="M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  mail: s('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
  phone: s('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>'),
  calendar: s('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  home: s('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  gear: s('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  shieldCheck: s('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M8.6 12.2l2.5 2.5 4.4-4.9"/>'),
  key: s('<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3 21 2M16 7l3 3M14 9l2 2"/>'),
  info: s('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.01" stroke-width="2.2"/>'),
  sparkle: s('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"/>'),
  whatsapp: s('<path d="M3 21l1.6-4.6A8.5 8.5 0 1 1 8 19.6L3 21Z"/><path d="M9 9.2c.3 2.4 2.6 4.8 5.6 5.6l1.3-1.2-1.9-1-.9.6c-.9-.3-1.9-1.3-2.3-2.3l.6-.9-1-1.9L9 9.2Z" fill="currentColor" stroke="none"/>'),

  // ---- ফুটার/যোগাযোগ/তথ্য-শিটের আইকন ----
  facebook: s('<path d="M13.6 21v-7.7h2.6l.5-3.2h-3.1V8.2c0-.9.4-1.7 1.8-1.7h1.4V3.7c-.3 0-1.2-.2-2.3-.2-2.4 0-4 1.5-4 4.1v2.5H7.9v3.2h2.6V21h3.1Z" fill="currentColor" stroke="none"/>'),
  youtube: s('<path fill-rule="evenodd" clip-rule="evenodd" d="M6.7 5h10.6A4.7 4.7 0 0 1 22 9.7v4.6a4.7 4.7 0 0 1-4.7 4.7H6.7A4.7 4.7 0 0 1 2 14.3V9.7A4.7 4.7 0 0 1 6.7 5Zm3.3 4.1v5.8l5.1-2.9L10 9.1Z" fill="currentColor" stroke="none"/>'),
  whatsappFill: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M17.5 14.4c-.3-.1-1.6-.8-1.9-.9-.2-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.2.2-.3.2-.5.1-.3-.1-1.2-.4-2.2-1.4-.8-.7-1.4-1.6-1.5-1.9-.2-.3 0-.4.1-.6.1-.1.3-.3.4-.5.1-.1.2-.3.2-.4.1-.2 0-.4 0-.5C11.6 9.2 11.2 8 11 7.5c-.2-.4-.3-.4-.5-.4h-.4c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.1 0 1.2.9 2.4 1 2.6.1.2 1.8 2.8 4.4 3.8.6.3 1.1.4 1.5.6.6.2 1.2.2 1.6.1.5-.1 1.6-.6 1.8-1.3.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/><path d="M12 2C6.5 2 2 6.5 2 12c0 1.9.5 3.6 1.4 5.1L2 22l5-1.3c1.4.8 3.1 1.3 4.9 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3C4.4 15 4 13.5 4 12c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8z"/></svg>`,
  yahoo: s('<path d="M2.8 7h3.9l2.3 4.5L11.3 7h3.5l-4.3 7.6V19H7.2v-4.4L2.8 7Z" fill="currentColor" stroke="none"/><path d="M15.9 6.2h2.9l-.6 8.2h-1.7l-.6-8.2Zm-.1 9.8h2.4v2.4h-2.4V16Z" fill="currentColor" stroke="none"/>'),
  copy: s('<rect x="9" y="9" width="11.5" height="11.5" rx="2.6"/><path d="M5.6 15H5.4A2.4 2.4 0 0 1 3 12.6V5.4A2.4 2.4 0 0 1 5.4 3h7.2A2.4 2.4 0 0 1 15 5.4v.2"/>'),
  doc: s('<path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8l-5-5Z"/><path d="M14 3v5h5M9 13h6M9 17h6M9 9h2"/>'),
  help: s('<circle cx="12" cy="12" r="9"/><path d="M9.4 9.3a2.7 2.7 0 0 1 5.2.9c0 1.8-2.6 2.3-2.6 4M12 17.4v.01" stroke-width="2"/>'),
  heart: s('<path d="M12 20.4s-7.5-4.5-7.5-10.1A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.7c0 5.6-7.5 10.1-7.5 10.1Z"/>')
};

/** নির্দিষ্ট নামের আইকন না পাওয়া গেলে ফলব্যাক হিসেবে code আইকন ব্যবহার হয় */
export function icon(name) {
  return icons[name] || icons.code;
}

// সার্ভিস কার্ডের জন্য যেসব আইকন বেছে নেওয়া যাবে (অ্যাডমিন ফর্মের ড্রপডাউনে ব্যবহৃত)
export const serviceIconChoices = [
  "code", "device", "server", "layout", "link", "shield",
  "settings", "chart", "globe", "lock", "message", "search",
  "bolt", "target", "rocket", "book"
];
