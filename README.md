# 🚀 نشر مجاني — Free Deploy Platform

موقع يجمع مواقع الاستضافة المجانية في مكان واحد — ارفع ملفك وانشره على 6 مواقع دفعة واحدة.

## ⚡ تشغيل سريع

```bash
# 1. تشغيل السيرفر
node server.js

# 2. افتح المتصفح على
http://localhost:3000
```

لا يحتاج أي تثبيت — يعمل بـ Node.js المدمج فقط.

## 🏗 هيكل المشروع

```
deploy-platform/
├── server.js          ← السيرفر (Pure Node.js - بدون مكتبات خارجية)
├── public/
│   └── index.html     ← الواجهة الأمامية الكاملة
└── README.md
```

## 🌐 المواقع المدعومة

| الموقع | الدومين | المميزات |
|--------|---------|---------|
| Netlify | netlify.app | أسرع CDN + SSL مجاني |
| Vercel | vercel.app | Edge Network عالمي |
| GitHub Pages | github.io | للمشاريع المفتوحة |
| Surge.sh | surge.sh | نشر فوري من CLI |
| Cloudflare Pages | pages.dev | أسرع شبكة في العالم |
| Render | onrender.com | يدعم Backend أيضاً |

## 🔌 API Endpoints

| Method | Path | الوصف |
|--------|------|-------|
| POST | /api/upload | رفع الملف |
| POST | /api/deploy | بدء النشر (SSE stream) |
| GET | /api/platforms | قائمة المواقع |
| GET | /* | الواجهة الثابتة |

## 🛠 كيف يعمل

1. **رفع الملف** — يُرفع إلى السيرفر بـ multipart/form-data
2. **اختيار المواقع** — واجهة بصرية تفاعلية
3. **النشر** — Server-Sent Events (SSE) لعرض التقدم في الوقت الفعلي
4. **النتائج** — روابط مباشرة لكل موقع

## 🔧 للنشر الحقيقي

لربط API المواقع الفعلية، عدّل دالة `simulateDeploy` في `server.js`:

```js
// مثال: Netlify API
const response = await fetch('https://api.netlify.com/api/v1/sites', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + process.env.NETLIFY_TOKEN },
  body: formData
});
```

## 🌍 متغيرات البيئة

```env
PORT=3000              # رقم البورت (افتراضي: 3000)
NETLIFY_TOKEN=...      # للنشر الحقيقي على Netlify
VERCEL_TOKEN=...       # للنشر الحقيقي على Vercel
```

## 📄 رخصة

MIT — مفتوح المصدر، استخدمه كيف تشاء.
