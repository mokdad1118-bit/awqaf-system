const { verifyAccessToken } = require('../utils/tokens');

/**
 * يتحقق من توكن الوصول (access token) المُرسَل في كوكي httpOnly.
 * لا نقبل التوكن أبداً من body أو query string لتفادي تسربه عبر السجلات
 * أو الروابط أو أدوات المراقبة.
 */
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.access_token;
  if (!token) {
    return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  }
  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      username: payload.username,
      roleCode: payload.role,
      permissions: payload.perms || [],
    };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'الجلسة منتهية أو غير صالحة، يرجى تسجيل الدخول مجدداً' });
  }
}

module.exports = { requireAuth };
