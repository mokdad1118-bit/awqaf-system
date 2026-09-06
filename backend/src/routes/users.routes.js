const express = require('express');
const { z } = require('zod');
const { pool, withUserContext } = require('../config/db');
const { hashPassword, validatePasswordStrength } = require('../utils/password');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { verifyCsrf } = require('../middleware/csrf');

const router = express.Router();
router.use(requireAuth, requirePermission('users.manage'));

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.full_name, u.is_active, u.must_change_password,
              u.last_login_at, u.created_at, r.code AS role_code, r.name_ar AS role_name,
              COALESCE((
                SELECT array_agg(perm.code) FROM awqaf_sweida.user_extra_permissions uep
                  JOIN awqaf_sweida.permissions perm ON perm.id = uep.permission_id
                  WHERE uep.user_id = u.id
              ), '{}') AS extra_permissions
       FROM awqaf_sweida.users u
       JOIN awqaf_sweida.roles r ON r.id = u.role_id
       ORDER BY u.created_at DESC`
    );
    return res.json({ users: rows });
  } catch (err) { return next(err); }
});

router.get('/roles', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT id, code, name_ar, description FROM awqaf_sweida.roles ORDER BY id`);
    return res.json({ roles: rows });
  } catch (err) { return next(err); }
});

// كل الصلاحيات المعروفة بالنظام — تُستخدم لعرض قائمة "صلاحيات إضافية" عند
// إضافة/تعديل مستخدم (الواجهة حالياً تعرض فقط data.export/data.import، لكن
// أي صلاحية إضافية مستقبلية ستظهر هنا تلقائياً دون تعديل الخادم).
router.get('/permissions', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT id, code, description FROM awqaf_sweida.permissions ORDER BY code`);
    return res.json({ permissions: rows });
  } catch (err) { return next(err); }
});

async function setExtraPermissions(client, userId, permissionCodes) {
  await client.query(`DELETE FROM awqaf_sweida.user_extra_permissions WHERE user_id = $1`, [userId]);
  if (!permissionCodes || permissionCodes.length === 0) return;
  const permRes = await client.query(
    `SELECT id, code FROM awqaf_sweida.permissions WHERE code = ANY($1::text[])`,
    [permissionCodes]
  );
  for (const p of permRes.rows) {
    await client.query(
      `INSERT INTO awqaf_sweida.user_extra_permissions (user_id, permission_id) VALUES ($1,$2)
       ON CONFLICT DO NOTHING`,
      [userId, p.id]
    );
  }
}

const createSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_.]+$/, 'اسم المستخدم يجب أن يكون بأحرف/أرقام إنكليزية فقط'),
  fullName: z.string().min(2).max(200),
  password: z.string().min(1),
  roleCode: z.string().min(1),
  extraPermissionCodes: z.array(z.string()).optional(),
});

router.post('/', verifyCsrf, async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' });
    }
    const { username, fullName, password, roleCode, extraPermissionCodes } = parsed.data;

    const strengthError = validatePasswordStrength(password);
    if (strengthError) return res.status(400).json({ error: strengthError });

    const roleRes = await pool.query(`SELECT id FROM awqaf_sweida.roles WHERE code = $1`, [roleCode]);
    if (!roleRes.rows[0]) return res.status(400).json({ error: 'دور وظيفي غير معروف' });

    const passwordHash = await hashPassword(password);

    const result = await withUserContext(req.user, async (client) => {
      const inserted = await client.query(
        `INSERT INTO awqaf_sweida.users (username, full_name, password_hash, role_id, created_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING id, username, full_name`,
        [username, fullName, passwordHash, roleRes.rows[0].id, req.user.id]
      );
      if (extraPermissionCodes) await setExtraPermissions(client, inserted.rows[0].id, extraPermissionCodes);
      return inserted;
    });
    return res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') { // unique_violation على مستوى قاعدة البيانات، وليس فقط تحقق التطبيق
      return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً' });
    }
    return next(err);
  }
});

const updateSchema = z.object({
  fullName: z.string().min(2).max(200).optional(),
  roleCode: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  extraPermissionCodes: z.array(z.string()).optional(),
});

router.patch('/:id', verifyCsrf, async (req, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'بيانات غير صالحة' });
    const { fullName, roleCode, isActive, extraPermissionCodes } = parsed.data;

    let roleId = null;
    if (roleCode) {
      const r = await pool.query(`SELECT id FROM awqaf_sweida.roles WHERE code = $1`, [roleCode]);
      if (!r.rows[0]) return res.status(400).json({ error: 'دور وظيفي غير معروف' });
      roleId = r.rows[0].id;
    }

    await withUserContext(req.user, async (client) => {
      await client.query(
        `UPDATE awqaf_sweida.users SET
           full_name = COALESCE($1, full_name),
           role_id = COALESCE($2, role_id),
           is_active = COALESCE($3, is_active)
         WHERE id = $4`,
        [fullName ?? null, roleId, isActive ?? null, req.params.id]
      );
      if (extraPermissionCodes !== undefined) await setExtraPermissions(client, req.params.id, extraPermissionCodes);
    });
    return res.json({ ok: true });
  } catch (err) { return next(err); }
});

// إعادة تعيين كلمة سر مستخدم من قبل مدير النظام (مثلاً بعد نسيانها)
router.post('/:id/reset-password', verifyCsrf, async (req, res, next) => {
  try {
    const schema = z.object({ newPassword: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'بيانات غير صالحة' });

    const strengthError = validatePasswordStrength(parsed.data.newPassword);
    if (strengthError) return res.status(400).json({ error: strengthError });

    const newHash = await hashPassword(parsed.data.newPassword);
    await withUserContext(req.user, (client) =>
      client.query(
        `UPDATE awqaf_sweida.users SET password_hash = $1, must_change_password = true,
           failed_login_count = 0, locked_until = NULL WHERE id = $2`,
        [newHash, req.params.id]
      )
    );
    // إبطال كل جلسات هذا المستخدم فوراً بعد إعادة تعيين كلمة السر
    await pool.query(`UPDATE awqaf_sweida.sessions SET revoked_at = now() WHERE user_id = $1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (err) { return next(err); }
});

module.exports = router;
