# ملف Dockerfile — تعليمات بناء "صندوق" (container) يحتوي الباكيند جاهز للتشغيل
# هذا الملف يجب أن يوضع في مجلد backend/ نفسه (بجانب package.json)

FROM node:20-alpine

WORKDIR /app

# نسخ ملفات package أولاً (لتحسين سرعة البناء عبر ذاكرة Docker المؤقتة)
COPY package*.json ./
RUN npm install --omit=dev

# نسخ باقي كود الباكيند
COPY . .

# لا نجبر رقم منفذ ثابت — كودنا (env.js) أصلاً يقرأ متغير PORT من البيئة
# تلقائياً، ومنصة الاستضافة هي اللي بتحدد قيمته وقت التشغيل.
EXPOSE 4000

CMD ["node", "src/server.js"]
