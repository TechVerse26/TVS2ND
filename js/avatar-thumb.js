// js/avatar-thumb.js
// কমিউনিটির পোস্ট/রিপ্লাইয়ে লেখকের ছোট অবতার (৭২×৭২) — ২৫৬px-এর মূল avatarData প্রতিটি
// ডকুমেন্টে কপি না করার জন্য। মানটা users/{uid}.avatarThumb-এ থাকে; firestore.rules পোস্টের
// authorAvatar-কে সেই বিশ্বাসযোগ্য মানের সাথে মিলিয়ে দেখে (অন্যের ছবি/নাম ব্যবহার আটকাতে)।

/** data:image URL → মাঝখান থেকে বর্গ করে কাটা ছোট JPEG data URL (ব্যর্থ হলে "") */
export function makeAvatarThumb(dataUrl, size = 72) {
  return new Promise((resolve) => {
    if (!dataUrl || !/^data:image\//.test(dataUrl)) { resolve(""); return; }
    const img = new Image();
    img.onload = () => {
      try {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        if (!side) { resolve(""); return; }
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
        let out = canvas.toDataURL("image/jpeg", 0.72);
        if (out.length > 11000) out = canvas.toDataURL("image/jpeg", 0.5);
        resolve(out.length <= 12000 ? out : "");
      } catch (_) { resolve(""); }
    };
    img.onerror = () => resolve("");
    img.src = dataUrl;
  });
}

/** rules যে অবতার-হোস্ট অনুমোদন করে (Google / GitHub) — অন্য বাইরের URL কমিউনিটিতে রাখা হয় না */
export function providerAvatarUrl(url) {
  const u = String(url || "");
  return u.length <= 500 && /^https:\/\/(lh[0-9]+\.googleusercontent\.com|avatars\.githubusercontent\.com)\//.test(u) ? u : "";
}
