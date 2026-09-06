const crypto = require('crypto');
const env = require('../config/env');

/**
 * حماية CSRF بنمط "التقديم المزدوج" (double-submit cookie):
 * عند تسجيل الدخول نضع قيمة عشوائية في كوكي غير httpOnly (csrf_token) حتى
 * تقدر واجهة الأمام تقرأها، ونطلب من كل طلب "يغيّر بيانات" (POST/PUT/PATCH/DELETE)
 * أن يرسل نفس القيمة في ترويسة X-CSRF-Token. موقع خبيث لا يقدر يقرأ الكوكي
 * (سياسة same-origin) وبالتالي لا يقدر يزوّر الترويسة، حتى لو نجح بجعل متصفح
 * الضحية يرسل الكوكي تلقائياً.
 */
function issueCsrfCookie(res) {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie('csrf_token', token, {
    httpOnly: false,
    secure: env.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/',
  });
  return token;
}

function verifyCsrf(req, res, next) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) return next();

  const cookieToken = req.cookies && req.cookies.csrf_token;
  const headerToken = req.get('X-CSRF-Token');
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'فشل التحقق من CSRF — أعد تحميل الصفحة وحاول مجدداً' });
  }
  return next();
}

module.exports = { issueCsrfCookie, verifyCsrf };
