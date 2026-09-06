const express = require('express');
const { z } = require('zod');
const { pool, withUserContext } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { verifyCsrf } = require('../middleware/csrf');

const router = express.Router();
router.use(requireAuth);

const schema = z.object({
  txDate: z.string().min(1),
  type: z.enum(['وارد', 'صادر']),
  categoryId: z.number().int(),
  mosqueId: z.string().uuid().optional().nullable(),
  amount: z.number().positive(),
  currency: z.enum(['ليرة سورية', 'دولار أمريكي', 'يورو', 'ليرة تركية']).optional(),
  method: z.enum(['نقدي', 'مصرفي', 'حوالة']).optional(),
  notes: z.string().max(4000).optional().nullable(),
});

router.get('/categories', requirePermission('finance.read'), async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT id, name, kind FROM awqaf_sweida.financial_categories ORDER BY name`);
    return res.json({ categories: result.rows });
  } catch (err) { return next(err); }
});

router.get('/', requirePermission('finance.read'), async (req, res, next) => {
  try {
    const result = await withUserContext(req.user, (client) =>
      client.query(`SELECT * FROM awqaf_sweida.transactions ORDER BY tx_date DESC, created_at DESC`)
    );
    return res.json({ transactions: result.rows });
  } catch (err) { return next(err); }
});

router.post('/', requirePermission('finance.write'), verifyCsrf, async (req, res, next) => {
  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' });
    const b = parsed.data;
    const result = await withUserContext(req.user, (client) =>
      client.query(
        `INSERT INTO awqaf_sweida.transactions (tx_date, type, category_id, mosque_id, amount, currency, method, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [b.txDate, b.type, b.categoryId, b.mosqueId || null, b.amount, b.currency || 'ليرة سورية', b.method || 'نقدي', b.notes || null, req.user.id]
      )
    );
    return res.status(201).json({ transaction: result.rows[0] });
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: 'البند أو المسجد المحدد غير موجود' });
    return next(err);
  }
});

router.put('/:id', requirePermission('finance.write'), verifyCsrf, async (req, res, next) => {
  try {
    const parsed = schema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'بيانات غير صالحة' });
    const b = parsed.data;

    const cur = await pool.query(`SELECT is_voided FROM awqaf_sweida.transactions WHERE id = $1`, [req.params.id]);
    if (!cur.rows[0]) return res.status(404).json({ error: 'غير موجود' });
    if (cur.rows[0].is_voided) return res.status(409).json({ error: 'لا يمكن تعديل معاملة مُلغاة' });

    const sets = [];
    const values = [];
    const map = { txDate: 'tx_date', type: 'type', categoryId: 'category_id', mosqueId: 'mosque_id', amount: 'amount', currency: 'currency', method: 'method', notes: 'notes' };
    Object.entries(map).forEach(([key, col]) => {
      if (b[key] !== undefined) { values.push(b[key]); sets.push(`${col} = $${values.length}`); }
    });
    if (sets.length === 0) return res.status(400).json({ error: 'لا يوجد شيء لتعديله' });
    values.push(req.params.id);

    const result = await withUserContext(req.user, (client) =>
      client.query(`UPDATE awqaf_sweida.transactions SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values)
    );
    return res.json({ transaction: result.rows[0] });
  } catch (err) { return next(err); }
});

// الإلغاء (void) هو البديل الوحيد المتاح للحذف — السجل المالي يبقى موجوداً
// دائماً للتدقيق، لكن يُستبعد من الأرصدة والتقارير. يتطلب صلاحية منفصلة
// (finance.void) عن صلاحية الإضافة العادية (finance.write) كطبقة حماية إضافية.
const voidSchema = z.object({ reason: z.string().min(3).max(500) });

router.post('/:id/void', requirePermission('finance.void'), verifyCsrf, async (req, res, next) => {
  try {
    const parsed = voidSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'يجب ذكر سبب الإلغاء (3 أحرف على الأقل)' });

    const result = await withUserContext(req.user, (client) =>
      client.query(
        `UPDATE awqaf_sweida.transactions
         SET is_voided = true, voided_by = $1, voided_at = now(), void_reason = $2
         WHERE id = $3 AND is_voided = false RETURNING *`,
        [req.user.id, parsed.data.reason, req.params.id]
      )
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'المعاملة غير موجودة أو ملغاة مسبقاً' });
    return res.json({ transaction: result.rows[0] });
  } catch (err) { return next(err); }
});

module.exports = router;
