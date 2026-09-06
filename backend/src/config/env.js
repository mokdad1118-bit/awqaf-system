require('dotenv').config();

function required(name) {
  const v = process.env[name];
  if (!v) {
    // نتوقف فوراً عند الإقلاع إذا كان أي سر أساسي مفقوداً بدل العمل بقيمة افتراضية غير آمنة
    // eslint-disable-next-line no-console
    console.error(`متغير بيئة مفقود: ${name}. راجع ملف .env.example`);
    process.exit(1);
  }
  return v;
}

function normalizeCorsOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/$/, '');
  }
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  databaseUrl: required('DATABASE_URL'),
  databaseSsl: process.env.DATABASE_SSL === 'true',
  jwtAccessSecret: required('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  jwtAccessExpiresMin: parseInt(process.env.JWT_ACCESS_EXPIRES_MIN || '15', 10),
  jwtRefreshExpiresDays: parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS || '7', 10),
  corsOrigin: normalizeCorsOrigin(process.env.CORS_ORIGIN || 'http://localhost:5173'),
  maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10),
  lockoutMinutes: parseInt(process.env.LOCKOUT_MINUTES || '15', 10),
  trustProxy: process.env.TRUST_PROXY === '1',
};
