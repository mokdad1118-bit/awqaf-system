const rateLimit = require('express-rate-limit');

// طبقة حماية إضافية على مستوى الـ IP، بالإضافة إلى قفل الحساب في قاعدة البيانات
// (انظر auth.routes.js). هذه تحد من هجمات القوة الغاشمة (brute force) حتى لو
// كان المهاجم يجرّب أسماء مستخدمين متعددة من نفس الجهاز.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'محاولات كثيرة جداً، حاول مرة أخرى بعد قليل' },
});

const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'عدد كبير من الطلبات، الرجاء الإبطاء قليلاً' },
});

module.exports = { loginLimiter, generalApiLimiter };
