const express = require('express');
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();
router.use(requireAuth, requirePermission('audit.read'));

// للقراءة فقط — لا يوجد أي مسار POST/PUT/DELETE على سجل التدقيق نفسه؛
// هو يُكتب حصراً من الـ trigger داخل قاعدة البيانات (audit_trigger_fn)
// ولا يمكن لأي طلب API التلاعب به مباشرة.
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const result = await pool.query(
      `SELECT al.*, u.username, u.full_name
       FROM awqaf_sweida.audit_log al
       LEFT JOIN awqaf_sweida.users u ON u.id = al.changed_by
       ORDER BY al.changed_at DESC LIMIT $1`,
      [limit]
    );
    return res.json({ auditLog: result.rows });
  } catch (err) { return next(err); }
});

module.exports = router;
