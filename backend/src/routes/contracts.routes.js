const { z } = require('zod');
const { makeCrudRouter } = require('../utils/crudFactory');

const CURRENCY = ['ليرة سورية', 'دولار أمريكي', 'يورو', 'ليرة تركية'];

const schema = z.object({
  contractNumber: z.string().min(1).max(100),
  projectId: z.string().uuid().optional().nullable(),
  partyOne: z.string().max(300).optional().nullable(),
  partyTwo: z.string().min(2).max(300),
  totalValue: z.number().nonnegative().optional().nullable(),
  currency: z.enum(CURRENCY).optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  status: z.enum(['ساري', 'منتهي', 'قيد التجديد']).optional(),
  attachments: z.string().max(1000).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

const columns = [
  ['contractNumber', 'contract_number'], ['projectId', 'project_id'], ['partyOne', 'party_one'],
  ['partyTwo', 'party_two'], ['totalValue', 'total_value'], ['currency', 'currency'],
  ['startDate', 'start_date'], ['endDate', 'end_date'], ['status', 'status'],
  ['attachments', 'attachments'], ['notes', 'notes'],
];

// الحذف النهائي للعقود ممنوع على مستوى قاعدة البيانات (REVOKE DELETE في schema.sql)
module.exports = makeCrudRouter({
  table: 'contracts',
  resourceKey: 'contract',
  schema,
  columns,
  permissions: { read: 'projects.read', write: 'projects.write' },
});
