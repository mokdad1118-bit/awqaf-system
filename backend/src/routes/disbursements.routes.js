const { z } = require('zod');
const { makeCrudRouter } = require('../utils/crudFactory');

const CURRENCY = ['ليرة سورية', 'دولار أمريكي', 'يورو', 'ليرة تركية'];

const schema = z.object({
  disbursementNumber: z.string().min(1).max(100),
  projectId: z.string().uuid(),   // إلزامي — يُختار من قائمة، غير قابل للكتابة الحرة بالواجهة
  mosqueId: z.string().uuid(),    // إلزامي — نفس الشيء
  contractId: z.number().int().optional().nullable(),
  contractorName: z.string().max(200).optional().nullable(),
  amount: z.number().positive(),
  currency: z.enum(CURRENCY).optional().nullable(),
  date: z.string().optional().nullable(),
  budgetItem: z.string().max(200).optional().nullable(),
  paymentMethod: z.enum(['نقدي', 'مصرفي', 'حوالة']).optional(),
  transferNumber: z.string().max(100).optional().nullable(),
  status: z.enum(['قيد المراجعة', 'معتمد', 'مصروف', 'مرفوض']).optional(),
  notes: z.string().max(4000).optional().nullable(),
  attachments: z.string().max(1000).optional().nullable(),
});

const columns = [
  ['disbursementNumber', 'disbursement_number'], ['projectId', 'project_id'], ['mosqueId', 'mosque_id'],
  ['contractId', 'contract_id'], ['contractorName', 'contractor_name'], ['amount', 'amount'],
  ['currency', 'currency'], ['date', 'disbursement_date'], ['budgetItem', 'budget_item'],
  ['paymentMethod', 'payment_method'], ['transferNumber', 'transfer_number'], ['status', 'status'],
  ['notes', 'notes'], ['attachments', 'attachments'],
];

// ملاحظة: مبلغ أمر الصرف يُتحقق منه تلقائياً في قاعدة البيانات (Trigger) بحيث
// لا يمكن أن يتجاوز مجموع أوامر الصرف على مشروع واحد قيمته التقديرية.
// الحذف النهائي ممنوع على مستوى قاعدة البيانات (REVOKE DELETE في schema.sql).
module.exports = makeCrudRouter({
  table: 'disbursements',
  resourceKey: 'disbursement',
  schema,
  columns,
  permissions: { read: 'projects.read', write: 'projects.write' },
});
