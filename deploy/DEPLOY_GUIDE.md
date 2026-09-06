# نشر نظام مديرية أوقاف السويداء مجاناً — بدون بطاقة ائتمان
## (قاعدة بيانات: Supabase — الباكيند: Back4app Containers)

---

## الخطوة 1: إنشاء قاعدة البيانات المجانية (Supabase)

1. روح لـ https://supabase.com وسجّل حساب جديد (بريد إلكتروني فقط، بدون بطاقة).
2. اضغط **New Project**.
   - اختر اسم للمشروع (مثلاً: awqaf-sweida)
   - اختر كلمة سر قوية لقاعدة البيانات (احفظها بمكان آمن)
   - اختر أقرب منطقة جغرافية (مثلاً Europe/Frankfurt)
3. انتظر دقيقتين لحد ما يجهز المشروع.
4. من القائمة الجانبية اضغط **Project Settings → Database**.
5. تحت **Connection string** اختر تبويب **URI** وانسخ الرابط — شكله هيك:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres
   ```
   استبدل `[YOUR-PASSWORD]` بكلمة السر اللي اخترتها بالخطوة 2.

6. من نفس الصفحة اضغط **SQL Editor** من القائمة الجانبية، اضغط **New query**، افتح ملف
   `database-schema.sql` عندك، انسخ محتواه كامل، الصقه بالمحرر، واضغط **Run**.
   - إذا ظهر أي خطأ متعلق بـ `awqaf_app` (لأن Supabase بيدير المستخدمين بطريقته الخاصة)،
     احذف من الملف فقط قسم "13) أدوار قاعدة البيانات نفسها" (كتلة `CREATE ROLE awqaf_app`
     والـ `GRANT` اللي بعدها) وشغّل الباقي — واستخدم مباشرة رابط `postgres` الأساسي
     بدل حساب `awqaf_app` بملف `.env` (أقل عزلاً أمنياً بس يعمل تمام لمرحلة التجربة).

7. أنشئ أول حساب مدير نظام محلياً على جهازك (قبل الرفع)، عبر:
   ```bash
   cd backend
   DATABASE_URL="رابط-supabase-كامل-من-فوق" node scripts/create-admin.js admin "مدير النظام" "كلمة-سر-قوية!"
   ```

---

## الخطوة 2: تجهيز الكود على GitHub

1. لو ما عندك حساب GitHub، أنشئ واحد مجاناً على github.com.
2. أنشئ مستودع (Repository) جديد، خاص (Private) أو عام، اسمه مثلاً `awqaf-sweida-backend`.
3. من جهازك، جوا مجلد `backend/`:
   ```bash
   git init
   git add .
   git commit -m "أول نسخة"
   git branch -M main
   git remote add origin https://github.com/USERNAME/awqaf-sweida-backend.git
   git push -u origin main
   ```
   **تأكد إنه ملف `.env` مو مرفوع** (لازم يكون عندك ملف `.gitignore` فيه سطر `.env` — إذا مش موجود
   ضيفه قبل الـ commit الأول).
4. ضيف ملفي `Dockerfile` و`.dockerignore` المرفقين هون داخل مجلد `backend/` بالمستودع، وارفعهم:
   ```bash
   git add Dockerfile .dockerignore
   git commit -m "إضافة Dockerfile للنشر"
   git push
   ```

---

## الخطوة 3: النشر على Back4app Containers

1. روح لـ https://containers.back4app.com وسجّل حساب مجاني (بدون بطاقة).
2. اضغط **New App** → اختر **Deploy from GitHub**.
3. اربط حساب GitHub تبعك، واختر مستودع `awqaf-sweida-backend`.
4. Back4app رح يكتشف تلقائياً وجود `Dockerfile` ويستخدمه للبناء.
5. بقسم **Environment Variables**، ضيف كل المتغيرات اللي بملف `.env` عندك يدوياً، وحدة وحدة:
   ```
   NODE_ENV=production
   DATABASE_URL=رابط-supabase-من-الخطوة-1
   DATABASE_SSL=true
   JWT_ACCESS_SECRET=(ولّد قيمة عشوائية قوية جديدة)
   JWT_REFRESH_SECRET=(ولّد قيمة عشوائية قوية جديدة مختلفة)
   CORS_ORIGIN=(عنوان الواجهة اللي رح تستضيفها — عدّله لاحقاً)
   TRUST_PROXY=1
   ```
   لتوليد قيم عشوائية قوية، شغّل هالأمر مرتين على جهازك وخذ ناتج مختلف لكل سر:
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```
   **ملاحظة مهمة:** لازم تضيف `DATABASE_SSL=true` وتتأكد إن `src/config/db.js` يستخدمها
   (Supabase يتطلب اتصال SSL) — إذا احتجت مساعدة بهاي النقطة قلي وبعدلها.

6. اضغط **Deploy**. بعد دقيقة أو دقيقتين رح يعطيك رابط حقيقي شكله مثل:
   ```
   https://awqaf-sweida-backend-xxxx.back4app.io
   ```
   هذا هو رابط الـ API تبعك — هو نفسه اللي رح تحطه بحقل "عنوان الخادم" بشاشة تسجيل الدخول
   بالواجهة (`index.html`)، بس تضيف له `/api` بالآخر.

---

## الخطوة 4: استضافة الواجهة (index.html)

الواجهة ملف HTML واحد بسيط، ما محتاج استضافة معقدة. أسهل خيار مجاني بدون بطاقة:
**GitHub Pages** (مجاني بالكامل، تابع لنفس حساب GitHub).

1. أنشئ مستودع جديد منفصل، ارفعله ملف `index.html`.
2. من إعدادات المستودع (Settings) → **Pages** → فعّل النشر من الفرع `main`.
3. بعد دقيقة رح يعطيك رابط شكله:
   ```
   https://USERNAME.github.io/REPO-NAME/
   ```
4. ارجع لإعدادات Back4app (خطوة 3-5) وحدّث `CORS_ORIGIN` ليصير نفس هذا الرابط بالضبط
   (بدون / بالآخر)، واحفظ — رح يعيد نشر الخدمة تلقائياً.

---

## خلاصة الروابط اللي رح يصير عندك بالنهاية

- قاعدة البيانات: مُدارة بالكامل من Supabase (ما بتحتاج تشغّلها بنفسك)
- الباكيند: `https://awqaf-sweida-backend-xxxx.back4app.io`
- الواجهة: `https://USERNAME.github.io/awqaf-sweida-frontend/`

كل هاي روابط حقيقية شغّالة 24 ساعة، **مستقلة تماماً عني** — أي تحديث كود بعدين، بعطيك
الملفات وبترفعها بنفس أوامر `git push`، وبتنشر تلقائياً خلال دقيقة.

---

## إذا علقت بأي خطوة

قلي بالضبط وين وقفت وشو رسالة الخطأ (لو في)، وبمشي معك خطوة خطوة.
