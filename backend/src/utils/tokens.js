const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.roleCode, perms: user.permissions || [] },
    env.jwtAccessSecret,
    { expiresIn: `${env.jwtAccessExpiresMin}m` }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret); // يرمي استثناء إذا كان غير صالح/منتهي
}

/**
 * توكن التحديث (refresh) نفسه لا يُخزَّن أبداً بشكله الأصلي في قاعدة البيانات.
 * نولّد قيمة عشوائية طويلة، ونرسلها للمتصفح فقط، ونخزّن hash منها في جدول sessions.
 * هذا يعني أنه حتى لو تسرّبت قاعدة البيانات، لا يمكن انتحال جلسات المستخدمين منها مباشرة.
 */
function generateRefreshToken() {
  const raw = crypto.randomBytes(48).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

module.exports = { signAccessToken, verifyAccessToken, generateRefreshToken, hashToken };
