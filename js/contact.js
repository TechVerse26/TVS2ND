// js/contact.js
// যোগাযোগের সব তথ্য এক জায়গায় — ফুটার, WhatsApp ফ্লোট বাটন ও Help & Support এখান থেকেই পড়ে।
//
// এগুলো ইচ্ছাকৃতভাবে কোডে রাখা হয়েছে (অ্যাডমিন প্যানেল বা Firestore থেকে নয়), তাই ইন্টারনেট না থাকলেও
// ফুটারের সব তথ্য ও লিংক ঠিকমতো দেখা যায়। কিছু বদলাতে চাইলে শুধু এই ফাইলটা এডিট করলেই হবে।

export const CONTACT = Object.freeze({
  brand: "Tech Verse",

  facebook: Object.freeze({
    url: "https://www.facebook.com/irnahmed360",
    handle: "facebook.com/irnahmed360"
  }),

  youtube: Object.freeze({
    url: "https://www.youtube.com/@imran.ahmedd",
    handle: "youtube.com/@imran.ahmedd"
  }),

  whatsapp: Object.freeze({
    number: "8801957329211", // দেশের কোডসহ, + বা স্পেস ছাড়া
    display: "+8801957329211",
    message: "Hello Tech Verse team, I'd like to discuss a project with you." // WhatsApp খুললে এই লেখাটা আগে থেকে বসানো থাকে
  }),

  phone: Object.freeze({
    local: "01957329211",
    intl: "+8801957329211" // tel: লিংকে দেশের কোডসহ দিলে রোমিং/বিদেশ থেকেও কাজ করে
  }),

  emails: Object.freeze([
    Object.freeze({ address: "tv.support.info@gmail.com", kind: "gmail" }),
    Object.freeze({ address: "info.techverse@yahoo.com", kind: "yahoo" })
  ])
});

/** WhatsApp চ্যাট লিংক (ডিফল্ট মেসেজ আগে থেকে লেখা থাকে) */
export function whatsappUrl(text = CONTACT.whatsapp.message) {
  return `https://wa.me/${CONTACT.whatsapp.number}?text=${encodeURIComponent(text)}`;
}

/** কল করার লিংক — ফোনে ট্যাপ করলেই ডায়াল হয় */
export function telUrl() {
  return `tel:${CONTACT.phone.intl}`;
}

/** ইমেইল লিংক (বিষয় আগে থেকে লেখা) */
export function mailUrl(address, subject = "Enquiry from the Tech Verse website") {
  return `mailto:${address}?subject=${encodeURIComponent(subject)}`;
}
