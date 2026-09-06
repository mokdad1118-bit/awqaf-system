const express = require('express');
const { pool, withUserContext } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { verifyCsrf } = require('../middleware/csrf');

/**
 * ينشئ راوت CRUD كامل ومحمي لجدول واحد، بنفس نمط mosques.routes.js تماماً.
 * تجميع هذا المنطق في مكان واحد (بدل تكراره يدوياً بكل ملف) يقلّل احتمال
 * نسيان تحقق أو صلاحية في أحد الوحدات — وهذا مهم أمنياً بحد ذاته.
 *
 * options:
 *  - table:            اسم الجدول الفعلي في قاعدة البيانات
 *  - resourceKey:       المفتاح المستخدم بالاستجابة JSON (مفرد وجمع)
 *  - schema:            مخطط zod (raw، سيُستخدم .partial() تلقائياً للتحديث)
 *  - columns:           [[مفتاح JS بالواجهة, اسم عمود قاعدة البيانات], ...]
 *  - permissions:       { read: 'x.read', write: 'x.write', delete?: 'x.write' }
 *  - allowDelete:       افتراضياً true. اجعلها false للسجلات التي لا يجوز حذفها نهائياً
 *    (متل السجلات المالية) — عندها تُحذف الصلاحية من الكود بدل الاعتماد فقط
 *    على قاعدة البيانات.
 */
function makeCrudRouter({ table, resourceKey, schema, columns, permissions, allowDelete = true }) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/', requirePermission(permissions.read), async (req, res, next) => {
    try {
      const result = await withUserContext(req.user, (client) =>
        client.query(`SELECT * FROM awqaf_sweida.${table} ORDER BY created_at DESC`)
      );
      return res.json({ [`${resourceKey}s`]: result.rows });
    } catch (err) { return next(err); }
  });

  router.get('/:id', requirePermission(permissions.read), async (req, res, next) => {
    try {
      const result = await withUserContext(req.user, (client) =>
        client.query(`SELECT * FROM awqaf_sweida.${table} WHERE id = $1`, [req.params.id])
      );
      if (!result.rows[0]) return res.status(404).json({ error: 'غير موجود' });
      return res.json({ [resourceKey]: result.rows[0] });
    } catch (err) { return next(err); }
  });

  router.post('/', requirePermission(permissions.write), verifyCsrf, async (req, res, next) => {
    try {
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' });
      const b = parsed.data;

      const cols = columns.map(([, col]) => col);
      const placeholders = columns.map((_, i) => `$${i + 1}`);
      const values = columns.map(([key]) => (b[key] === undefined ? null : b[key]));

      const result = await withUserContext(req.user, (client) =>
        client.query(
          `INSERT INTO awqaf_sweida.${table} (${cols.join(',')}, created_by)
           VALUES (${placeholders.join(',')}, $${cols.length + 1}) RETURNING *`,
          [...values, req.user.id]
        )
      );
      return res.status(201).json({ [resourceKey]: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'قيمة مكررة (رقم موجود مسبقاً)' });
      if (err.code === '23503') return res.status(400).json({ error: 'مرجع غير موجود (مثال: مسجد أو مشروع محذوف)' });
      return next(err);
    }
  });

  router.put('/:id', requirePermission(permissions.write), verifyCsrf, async (req, res, next) => {
    try {
      const parsed = schema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' });
      const b = parsed.data;

      const sets = [];
      const values = [];
      columns.forEach(([key, col]) => {
        if (b[key] !== undefined) {
          values.push(b[key]);
          sets.push(`${col} = $${values.length}`);
        }
      });
      if (sets.length === 0) return res.status(400).json({ error: 'لا يوجد شيء لتعديله' });
      values.push(req.params.id);

      const result = await withUserContext(req.user, (client) =>
        client.query(
          `UPDATE awqaf_sweida.${table} SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
          values
        )
      );
      if (!result.rows[0]) return res.status(404).json({ error: 'غير موجود' });
      return res.json({ [resourceKey]: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'قيمة مكررة (رقم موجود مسبقاً)' });
      if (err.code === '23503') return res.status(400).json({ error: 'مرجع غير موجود' });
      return next(err);
    }
  });

  if (allowDelete) {
    router.delete('/:id', requirePermission(permissions.delete || permissions.write), verifyCsrf, async (req, res, next) => {
      try {
        const result = await withUserContext(req.user, (client) =>
          client.query(`DELETE FROM awqaf_sweida.${table} WHERE id = $1`, [req.params.id])
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'غير موجود' });
        return res.json({ ok: true });
      } catch (err) {
        if (err.code === '23503') return res.status(409).json({ error: 'لا يمكن الحذف — يوجد سجلات أخرى مرتبطة بهذا العنصر' });
        if (err.code === '42501') return res.status(403).json({ error: 'الحذف النهائي غير مسموح لهذا النوع من السجلات' });
        return next(err);
      }
    });
  }

  return router;
}

module.exports = { makeCrudRouter };
