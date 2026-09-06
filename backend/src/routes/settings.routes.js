const express = require('express');
const { z } = require('zod');
const { pool, withUserContext } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { verifyCsrf } = require('../middleware/csrf');

const router = express.Router();
router.use(requireAuth);

router.get('/', requirePermission('settings.manage'), async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT * FROM awqaf_sweida.settings WHERE id = true`);
    return res.json({ settings: result.rows[0] });
  } catch (err) { return next(err); }
});

const schema = z.object({
  ministryName: z.string().min(2).max(300).optional(),
  directorateName: z.string().min(2).max(300).optional(),
  currencyCode: z.string().min(1).max(20).optional(),
});

router.put('/', requirePermission('settings.manage'), verifyCsrf, async (req, res, next) => {
  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'بيانات غير صالحة' });
    const b = parsed.data;
    const result = await withUserContext(req.user, (client) =>
      client.query(
        `UPDATE awqaf_sweida.settings SET
           ministry_name = COALESCE($1, ministry_name),
           directorate_name = COALESCE($2, directorate_name),
           currency_code = COALESCE($3, currency_code),
           updated_by = $4
         WHERE id = true RETURNING *`,
        [b.ministryName ?? null, b.directorateName ?? null, b.currencyCode ?? null, req.user.id]
      )
    );
    return res.json({ settings: result.rows[0] });
  } catch (err) { return next(err); }
});

module.exports = router;
