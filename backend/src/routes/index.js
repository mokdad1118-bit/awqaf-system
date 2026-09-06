const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/users', require('./users.routes'));
router.use('/mosques', require('./mosques.routes'));
router.use('/projects', require('./projects.routes'));
router.use('/price-quotes', require('./priceQuotes.routes'));
router.use('/contracts', require('./contracts.routes'));
router.use('/engineer-statements', require('./engineerStatements.routes'));
router.use('/disbursements', require('./disbursements.routes'));
router.use('/circles', require('./circles.routes'));
router.use('/schools', require('./schools.routes'));
router.use('/archive', require('./archive.routes'));
router.use('/budgets', require('./budgets.routes'));
router.use('/transactions', require('./transactions.routes'));
router.use('/employees', require('./employees.routes'));
router.use('/settings', require('./settings.routes'));
router.use('/audit-log', require('./auditLog.routes'));

module.exports = router;
