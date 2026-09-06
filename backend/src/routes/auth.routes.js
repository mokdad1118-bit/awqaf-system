const express = require('express');
const { z } = require('zod');
const { pool, withUserContext } = require('../config/db');
const { verifyPassword, hashPassword, validatePasswordStrength } = require('../utils/password');
const { signAccessToken, generateRefreshToken, hashToken } = require('../utils/tokens');
const { requireAuth } = require('../middleware/auth');
const { issueCsrfCookie, verifyCsrf } = require('../middleware/csrf');
const { loginLimiter } = require('../middleware/rateLimit');
const env = require('../config/env');

const router = express.Router();

const loginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(1).max(200),
});

const cookieOpts = {
  httpOnly: true,
  secure: env.nodeEnv === 'production', // HTTPS إلزامي بالإنتاج؛ يُستثنى محلياً فقط لتجربة http://localhost
  sameSite: 'strict',
  path: '/',
};

async function fetchUserByUsername(username) {
  // الصلاحيات الفعلية = صلاحيات الدور الوظيفي ∪ الصلاحيات الإضافية الممنوحة
  // للمستخدم تحديداً (user_extra_permissions). UNION (بدون ALL) يزيل التكرار.
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.full_name, u.password_hash, u.is_active,
            u.must_change_password, u.failed_login_count, u.locked_until,
            r.code AS role_code,
            COALESCE((
              SELECT array_agg(code) FROM (
                SELECT perm.code FROM awqaf_sweida.role_permissions rp
                  JOIN awqaf_sweida.permissions perm ON perm.id = rp.permission_id
                  WHERE rp.role_id = u.role_id
                UNION
                SELECT perm2.code FROM awqaf_sweida.user_extra_permissions uep
                  JOIN awqaf_sweida.permissions perm2 ON perm2.id = uep.permission_id
                  WHERE uep.user_id = u.id
              ) combined_permissions
            ), '{}') AS permissions
     FROM awqaf_sweida.users u
     JOIN awqaf_sweida.roles r ON r.id = u.role_id
     WHERE u.username = $1`,
    [username]
  );
  return rows[0] || null;
}

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    fullName: u.full_name,
    role: u.role_code,
    permissions: u.permissions,
    mustChangePassword: u.must_change_password,
  };
}

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'بيانات الدخول غير مكتملة' });
    }
    const { username, password } = parsed.data;
    const ip = req.ip;
    const ua = req.get('user-agent') || '';

    const user = await fetchUserByUsername(username);

    // رسالة خطأ عامة وموحّدة في كل حالات الفشل حتى لا نكشف هل اسم المستخدم موجود أصلاً
    const genericFail = () => res.status(401).json({ error: 'اسم المستخدم أو كلمة السر غير صحيحة' });

    if (!user) {
      await pool.query(
        `INSERT INTO awqaf_sweida.login_attempts (username, ip_address, success) VALUES ($1,$2,false)`,
        [username, ip]
      );
      return genericFail();
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await pool.query(
        `INSERT INTO awqaf_sweida.login_attempts (username, ip_address, success) VALUES ($1,$2,false)`,
        [username, ip]
      );
      return res.status(423).json({ error: 'الحساب مقفل مؤقتاً بسبب محاولات دخول فاشلة متكررة، حاول لاحقاً' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'هذا الحساب غير مفعّل، راجع مدير النظام' });
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      const attempts = (user.failed_login_count || 0) + 1;
      const locked = attempts >= env.maxLoginAttempts;
      await pool.query(
        `UPDATE awqaf_sweida.users SET failed_login_count = $1,
           locked_until = $2
         WHERE id = $3`,
        [attempts, locked ? new Date(Date.now() + env.lockoutMinutes * 60000) : null, user.id]
      );
      await pool.query(
        `INSERT INTO awqaf_sweida.login_attempts (username, ip_address, success) VALUES ($1,$2,false)`,
        [username, ip]
      );
      if (locked) {
        return res.status(423).json({ error: `تم قفل الحساب لمدة ${env.lockoutMinutes} دقيقة بعد محاولات فاشلة متكررة` });
      }
      return genericFail();
    }

    // نجاح الدخول: إعادة الضبط + إصدار الجلسات
    await pool.query(
      `UPDATE awqaf_sweida.users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`,
      [user.id]
    );
    await pool.query(
      `INSERT INTO awqaf_sweida.login_attempts (username, ip_address, success) VALUES ($1,$2,true)`,
      [username, ip]
    );

    const accessToken = signAccessToken({
      id: user.id, username: user.username, roleCode: user.role_code, permissions: user.permissions,
    });
    const { raw, hash } = generateRefreshToken();
    const expiresAt = new Date(Date.now() + env.jwtRefreshExpiresDays * 86400000);
    await pool.query(
      `INSERT INTO awqaf_sweida.sessions (user_id, token_hash, ip_address, user_agent, expires_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [user.id, hash, ip, ua, expiresAt]
    );

    res.cookie('access_token', accessToken, { ...cookieOpts, maxAge: env.jwtAccessExpiresMin * 60000 });
    res.cookie('refresh_token', raw, { ...cookieOpts, maxAge: env.jwtRefreshExpiresDays * 86400000 });
    issueCsrfCookie(res);

    return res.json({ user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const raw = req.cookies && req.cookies.refresh_token;
    if (!raw) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
    const hash = hashToken(raw);

    const { rows } = await pool.query(
      `SELECT s.id AS session_id, s.expires_at, s.revoked_at, u.id, u.username, u.full_name,
              u.is_active, r.code AS role_code,
              COALESCE((
                SELECT array_agg(code) FROM (
                  SELECT perm.code FROM awqaf_sweida.role_permissions rp
                    JOIN awqaf_sweida.permissions perm ON perm.id = rp.permission_id
                    WHERE rp.role_id = u.role_id
                  UNION
                  SELECT perm2.code FROM awqaf_sweida.user_extra_permissions uep
                    JOIN awqaf_sweida.permissions perm2 ON perm2.id = uep.permission_id
                    WHERE uep.user_id = u.id
                ) combined_permissions
              ), '{}') AS permissions
       FROM awqaf_sweida.sessions s
       JOIN awqaf_sweida.users u ON u.id = s.user_id
       JOIN awqaf_sweida.roles r ON r.id = u.role_id
       WHERE s.token_hash = $1`,
      [hash]
    );
    const session = rows[0];
    if (!session || session.revoked_at || new Date(session.expires_at) < new Date() || !session.is_active) {
      return res.status(401).json({ error: 'الجلسة منتهية، يرجى تسجيل الدخول مجدداً' });
    }

    // تدوير توكن التحديث (refresh rotation): نصدر واحداً جديداً ونلغي القديم
    const { raw: newRaw, hash: newHash } = generateRefreshToken();
    const newExpiresAt = new Date(Date.now() + env.jwtRefreshExpiresDays * 86400000);
    await pool.query(
      `UPDATE awqaf_sweida.sessions SET token_hash = $1, expires_at = $2 WHERE id = $3`,
      [newHash, newExpiresAt, session.session_id]
    );

    const accessToken = signAccessToken({
      id: session.id, username: session.username, roleCode: session.role_code, permissions: session.permissions,
    });
    res.cookie('access_token', accessToken, { ...cookieOpts, maxAge: env.jwtAccessExpiresMin * 60000 });
    res.cookie('refresh_token', newRaw, { ...cookieOpts, maxAge: env.jwtRefreshExpiresDays * 86400000 });
    issueCsrfCookie(res);

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.post('/logout', verifyCsrf, async (req, res, next) => {
  try {
    const raw = req.cookies && req.cookies.refresh_token;
    if (raw) {
      const hash = hashToken(raw);
      await pool.query(`UPDATE awqaf_sweida.sessions SET revoked_at = now() WHERE token_hash = $1`, [hash]);
    }
    res.clearCookie('access_token', cookieOpts);
    res.clearCookie('refresh_token', cookieOpts);
    res.clearCookie('csrf_token', { path: '/' });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await fetchUserByUsername(req.user.username);
    if (!user) return res.status(401).json({ error: 'المستخدم غير موجود' });
    return res.json({ user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

router.post('/change-password', requireAuth, verifyCsrf, async (req, res, next) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'بيانات غير صالحة' });
    const { oldPassword, newPassword } = parsed.data;

    const user = await fetchUserByUsername(req.user.username);
    const ok = await verifyPassword(oldPassword, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'كلمة السر الحالية غير صحيحة' });

    const strengthError = validatePasswordStrength(newPassword);
    if (strengthError) return res.status(400).json({ error: strengthError });

    const newHash = await hashPassword(newPassword);
    await withUserContext(req.user, (client) =>
      client.query(
        `UPDATE awqaf_sweida.users SET password_hash = $1, must_change_password = false WHERE id = $2`,
        [newHash, user.id]
      )
    );
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
