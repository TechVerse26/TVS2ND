# Tech Verse — সম্পূর্ণ ওয়েবসাইট

পিওর JavaScript + CSS (কোনো ফ্রেমওয়ার্ক ছাড়া) দিয়ে তৈরি একটি সম্পূর্ণ এজেন্সি ওয়েবসাইট, Firebase Authentication (ইমেইল/পাসওয়ার্ড, Google, GitHub) ও Firestore-ভিত্তিক ইউজার প্রোফাইল ও বুকিং সিস্টেমসহ।

## ✅ যা যা আছে

- আধুনিক, গ্লো/লাইটিং ইফেক্ট ছাড়া ডিজাইন (dark/light থিম টগলসহ)
- সার্ভিস, পোর্টফোলিও (ফিল্টারসহ), কেস স্টাডি, স্ট্যাটস কাউন্টার, টেস্টিমোনিয়াল ক্যারুসেল, টিম, প্রাইসিং, FAQ অ্যাকর্ডিয়ন
- মাল্টি-স্টেপ বুকিং/কনসালটেশন ফর্ম (Firestore-এ সংরক্ষিত হয়)
- সম্পূর্ণ Firebase Auth: ইমেইল/পাসওয়ার্ড সাইন আপ-সাইন ইন, Google লগইন, GitHub লগইন, পাসওয়ার্ড রিসেট
- লগইন করা ইউজারের প্রোফাইল পেজ (নাম/ফোন আপডেট + নিজের বুকিং হিস্টরি দেখা)
- WhatsApp ফ্লোটিং বাটন (নম্বর: 01957329211)
- PWA সাপোর্ট (ইনস্টলযোগ্য + অফলাইন app-shell ক্যাশ)
- SEO মেটা ট্যাগ, রেসপনসিভ লেআউট, কীবোর্ড ফোকাস স্টেট, reduced-motion সাপোর্ট

## 📁 ফোল্ডার স্ট্রাকচার

```
techverse-agency/
├── index.html
├── manifest.json
├── sw.js
├── css/styles.css
└── js/
    ├── firebase-config.js   ← এখানে আপনার Firebase কনফিগ বসবে
    ├── auth.js
    ├── data.js               ← সব টেক্সট/কন্টেন্ট এখানে
    ├── templates.js
    ├── router.js
    ├── animations.js
    ├── toast.js
    └── app.js
```

## 1) Firebase প্রজেক্ট সেটআপ

1. [Firebase Console](https://console.firebase.google.com) → **Add project** → একটা নাম দিন (যেমন `techverse-agency`)।
2. প্রজেক্ট তৈরি হলে **Build → Authentication → Get started**।
3. **Sign-in method** ট্যাবে গিয়ে এই তিনটা প্রোভাইডার চালু করুন:
   - **Email/Password** → Enable করুন।
   - **Google** → Enable করুন, একটা support email দিন।
   - **GitHub** → Enable করার আগে ধাপ ৩ দেখুন নিচে।
4. **Build → Firestore Database → Create database** → production mode-এ শুরু করুন (region আপনার কাছাকাছি বেছে নিন)।
5. **Project settings (⚙️) → General → Your apps → Web (</>) আইকন** → একটা অ্যাপ রেজিস্টার করুন → যে `firebaseConfig` অবজেক্ট পাবেন সেটা কপি করে `js/firebase-config.js`-এ বসান।

## 2) GitHub লগইন চালু করা

GitHub প্রোভাইডার কাজ করতে একটা GitHub OAuth App লাগবে:

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**।
2. **Homepage URL**: আপনার সাইটের ঠিকানা (যেমন `https://yourdomain.com`)।
3. **Authorization callback URL**: Firebase Console-এর GitHub প্রোভাইডার সেটিংসে এই URL-টা দেখানো থাকবে —
   `https://YOUR_PROJECT_ID.firebaseapp.com/__/auth/handler`
4. OAuth App তৈরি হলে **Client ID** ও **Client Secret** পাবেন — সেই দুটো Firebase Console-এর GitHub প্রোভাইডার সেটিংসে বসিয়ে **Save** করুন।

## 3) Firestore সিকিউরিটি রুল

**Firestore Database → Rules**-এ গিয়ে এটা বসান:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /bookings/{bookingId} {
      allow create: if true;
      allow read: if request.auth != null && resource.data.uid == request.auth.uid;
      allow update, delete: if false;
    }
  }
}
```

> এতে প্রতিটি ইউজার শুধু নিজের প্রোফাইল ও নিজের বুকিং দেখতে পারবে। যেকোনো ভিজিটর বুকিং ফর্ম সাবমিট করতে পারবে (লগইন ছাড়াও), তবে সেটা শুধু অ্যাডমিন Firebase Console থেকে দেখা যাবে। ভবিষ্যতে spam আটকাতে reCAPTCHA যোগ করার কথা ভাবতে পারেন।

## 4) লোকালি চালানো

ES module ব্যবহার করা হয়েছে বলে ফাইলটা সরাসরি ব্রাউজারে খুললে (file://) কাজ করবে না — একটা লোকাল সার্ভার লাগবে:

```
npx serve .
```
অথবা VS Code-এর **Live Server** এক্সটেনশন ব্যবহার করুন।

## 5) ডিপ্লয় করা

**Firebase Hosting (সবচেয়ে সহজ, একই প্রজেক্ট):**
```
npm install -g firebase-tools
firebase login
firebase init hosting     # public directory হিসেবে এই ফোল্ডার বেছে নিন
firebase deploy
```

**অথবা Netlify/Vercel:** পুরো ফোল্ডারটা টেনে ড্রপ করলেই হয়ে যাবে — কোনো বিল্ড স্টেপ লাগবে না।

## 6) কন্টেন্ট কাস্টমাইজ করা

- সব টেক্সট (সার্ভিস, পোর্টফোলিও, টেস্টিমোনিয়াল, টিম, FAQ, প্রাইসিং) → `js/data.js`
- WhatsApp নম্বর → `js/app.js`-এর `WHATSAPP_NUMBER` ভ্যারিয়েবল
- রং/ফন্ট/স্পেসিং → `css/styles.css`-এর `:root` টোকেনগুলো

## 7) ছোট্ট একটা নোট PWA আইকন নিয়ে

এখন favicon/manifest-এ একটা SVG আইকন বসানো আছে যাতে কাজ চলে যায়, কিন্তু Android-এ পুরোপুরি ইনস্টলযোগ্য করতে চাইলে `manifest.json`-এ ১৯২×১৯২ ও ৫১২×৫১২ সাইজের আসল PNG আইকন যোগ করা ভালো।

---
টেস্টিমোনিয়াল ও টিম সেকশনে এখন নমুনা (placeholder) কন্টেন্ট আছে — `js/data.js`-এ গিয়ে আসল নাম/ছবি/ফিডব্যাক দিয়ে বদলে নিন।
