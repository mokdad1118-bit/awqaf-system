const { z } = require('zod');
const { makeCrudRouter } = require('../utils/crudFactory');

const schema = z.object({
  fiscalYear: z.number().int().min(2000).max(2100),
  mosqueId: z.string().uuid().optional().nullable(),
  categoryId: z.number().int(),
  allocatedAmount: z.number().nonnegative(),
  currency: z.enum(['ليرة سورية', 'دولار أمريكي', 'يورو', 'ليرة تركية']).optional(),
  notes: z.string().max(4000).optional().nullable(),
});

const columns = [
  ['fiscalYear', 'fiscal_year'], ['mosqueId', 'mosque_id'], ['categoryId', 'category_id'],
  ['allocatedAmount', 'allocated_amount'], ['currency', 'currency'], ['notes', 'notes'],
];

// الحذف النهائي للميزانية ممنوع على مستوى قاعدة البيانات (REVOKE DELETE في schema.sql)
module.exports = makeCrudRouter({
  table: 'budgets',
  resourceKey: 'budget',
  schema,
  columns,
  permissions: { read: 'finance.read', write: 'budgets.write' },
});
