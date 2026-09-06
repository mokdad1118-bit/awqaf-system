const env = require('../config/env');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // نسجّل تفاصيل الخطأ الكاملة في السيرفر فقط (وليس للمستخدم أبداً)
  // eslint-disable-next-line no-console
  console.error('[ERROR]', new Date().toISOString(), req.method, req.originalUrl, err);

  const status = err.status || 500;
  const body = { error: err.publicMessage || 'حدث خطأ غير متوقع، يرجى المحاولة لاحقاً' };
  if (env.nodeEnv !== 'production') {
    // تفاصيل إضافية فقط أثناء التطوير المحلي، أبداً في الإنتاج
    body.debug = err.message;
  }
  res.status(status).json(body);
}

module.exports = { errorHandler };
