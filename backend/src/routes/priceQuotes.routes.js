const { z } = require('zod');
const { makeCrudRouter } = require('../utils/crudFactory');

const CURRENCY = ['ليرة سورية', 'دولار أمريكي', 'يورو', 'ليرة تركية'];

const schema = z.object({
  quoteNumber: z.string().min(1).max(100),
  projectId: z.string().uuid().optional().nullable(),
  contractorName: z.string().min(2).max(200),
  contractorAddress: z.string().max(300).optional().nullable(),
  totalValue: z.number().nonnegative().optional().nullable(),
  currency: z.enum(CURRENCY).optional().nullable(),
  executionDuration: z.string().max(200).optional().nullable(),
  supervisingEngineer: z.string().max(200).optional().nullable(),
  status: z.enum(['مقدم', 'مقبول', 'مرفوض', 'منتهي الصلاحية']).optional(),
  conditionNote: z.string().max(500).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

const columns = [
  ['quoteNumber', 'quote_number'], ['projectId', 'project_id'], ['contractorName', 'contractor_name'],
  ['contractorAddress', 'contractor_address'], ['totalValue', 'total_value'], ['currency', 'currency'],
  ['executionDuration', 'execution_duration'], ['supervisingEngineer', 'supervising_engineer'],
  ['status', 'status'], ['conditionNote', 'condition_note'], ['notes', 'notes'],
];

module.exports = makeCrudRouter({
  table: 'price_quotes',
  resourceKey: 'quote',
  schema,
  columns,
  permissions: { read: 'projects.read', write: 'projects.write' },
});
