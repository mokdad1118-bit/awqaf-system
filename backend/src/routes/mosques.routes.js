const express = require('express');
const { z } = require('zod');
const { pool, withUserContext } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { verifyCsrf } = require('../middleware/csrf');

const router = express.Router();
router.use(requireAuth);

const mosqueSchema = z.object({
  name: z.string().min(2).max(300),
  cityVillage: z.string().max(200).optional().nullable(),
  location: z.string().max(300).optional().nullable(),
  areaSqm: z.number().nonnegative().optional().nullable(),
  annexes: z.string().max(2000).optional().nullable(),
  imamName: z.string().max(200).optional().nullable(),
  khatibName: z.string().max(200).optional().nullable(),
  muezzinName: z.string().max(200).optional().nullable(),
  caretakerName: z.string().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  category: z.enum(['أ', 'ب', 'ج', 'د']).optional().nullable(),
  type: z.enum(['عام', 'خاص', 'مركزي', 'عام أثري', 'مركزي أثري']).optional().nullable(),
  isActive: z.boolean().optional(),
  fridaySermon: z.boolean().optional(),
  status: z.enum([
    'جاهز', 'بانتظار الترميم', 'قيد الترميم', 'تم ترميمه',
    'قيد البناء', 'تم بناؤه', 'طوائف أخرى مفعل', 'طوائف أخرى غير مفعل',
  ]).optional(),
  technicalCondition: z.enum(['ممتازة', 'جيدة', 'متوسطة', 'سيئة', 'سيئة جداً']).optional().nullable(),
  demolitionStatus: z.enum(['غير مهدم', 'مهدم جزئياً', 'مهدم كلياً']).optional(),
  demolitionPercentage: z.union([z.literal(5), z.literal(25), z.literal(50), z.literal(75), z.literal(100)]).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

const COLUMNS = [
  ['name', 'name'], ['cityVillage', 'city_village'], ['location', 'location'],
  ['areaSqm', 'area_sqm'], ['annexes', 'annexes'], ['imamName', 'imam_name'],
  ['khatibName', 'khatib_name'], ['muezzinName', 'muezzin_name'], ['caretakerName', 'caretaker_name'],
  ['phone', 'phone'], ['category', 'category'], ['type', 'type'], ['isActive', 'is_active'],
  ['fridaySermon', 'friday_sermon'], ['status', 'status'], ['technicalCondition', 'technical_condition'],
  ['demolitionStatus', 'demolition_status'], ['demolitionPercentage', 'demolition_percentage'], ['notes', 'notes'],
];

router.get('/', requirePermission('mosques.read'), async (req, res, next) => {
  try {
    const result = await withUserContext(req.user, (client) =>
      client.query(`SELECT * FROM awqaf_sweida.mosques ORDER BY created_at DESC`)
    );
    return res.json({ mosques: result.rows });
  } catch (err) { return next(err); }
});

router.get('/:id', requirePermission('mosques.read'), async (req, res, next) => {
  try {
    const result = await withUserContext(req.user, (client) =>
      client.query(`SELECT * FROM awqaf_sweida.mosques WHERE id = $1`, [req.params.id])
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'غير موجود' });
    return res.json({ mosque: result.rows[0] });
  } catch (err) { return next(err); }
});

router.post('/', requirePermission('mosques.write'), verifyCsrf, async (req, res, next) => {
  try {
    const parsed = mosqueSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
    const b = parsed.data;

    const cols = COLUMNS.map(([, col]) => col);
    const placeholders = COLUMNS.map((_, i) => `$${i + 1}`);
    const values = COLUMNS.map(([key]) => (b[key] === undefined ? null : b[key]));

    const result = await withUserContext(req.user, (client) =>
      client.query(
        `INSERT INTO awqaf_sweida.mosques (${cols.join(',')}, created_by)
         VALUES (${placeholders.join(',')}, $${cols.length + 1}) RETURNING *`,
        [...values, req.user.id]
      )
    );
    return res.status(201).json({ mosque: result.rows[0] });
  } catch (err) { return next(err); }
});

router.put('/:id', requirePermission('mosques.write'), verifyCsrf, async (req, res, next) => {
  try {
    const parsed = mosqueSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
    const b = parsed.data;

    const sets = [];
    const values = [];
    COLUMNS.forEach(([key, col]) => {
      if (b[key] !== undefined) {
        values.push(b[key]);
        sets.push(`${col} = $${values.length}`);
      }
    });
    if (sets.length === 0) return res.status(400).json({ error: 'لا يوجد شيء لتعديله' });
    values.push(req.params.id);

    const result = await withUserContext(req.user, (client) =>
      client.query(
        `UPDATE awqaf_sweida.mosques SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
        values
      )
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'غير موجود' });
    return res.json({ mosque: result.rows[0] });
  } catch (err) { return next(err); }
});

// الحذف: سياسة RLS "mosques_delete_access" في schema.sql تقصره على admin فعلياً
// على مستوى قاعدة البيانات، بصرف النظر عمّا يسمح به هذا الراوت.
router.delete('/:id', requirePermission('mosques.write'), verifyCsrf, async (req, res, next) => {
  try {
    await withUserContext(req.user, (client) =>
      client.query(`DELETE FROM awqaf_sweida.mosques WHERE id = $1`, [req.params.id])
    );
    return res.json({ ok: true });
  } catch (err) {
    if (err.code === '42501' || /policy/i.test(err.message || '')) {
      return res.status(403).json({ error: 'لا تملك صلاحية حذف المساجد' });
    }
    return next(err);
  }
});

module.exports = router;

/*
  لإضافة أي قسم آخر (المشاريع، العقود، الحلقات القرآنية...) اتبع نفس النمط:
  مخطط zod للتحقق، requirePermission بالصلاحية المناسبة، withUserContext لكل
  استعلام (حتى يعمل سجل التدقيق وRLS بشكل صحيح)، واستعلامات معاملة ($1,$2...)
  دائماً — لا يُكتب أي استعلام SQL بدمج نص المستخدم مباشرة تحت أي ظرف.
  تذكّر أيضاً تحديث schema.sql إذا احتاج الجدول أعمدة جديدة قبل كتابة الراوت.
*/
