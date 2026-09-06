const { z } = require('zod');
const { makeCrudRouter } = require('../utils/crudFactory');

const CURRENCY = ['ليرة سورية', 'دولار أمريكي', 'يورو', 'ليرة تركية'];

const schema = z.object({
  projectNumber: z.string().min(1).max(100),
  name: z.string().min(2).max(300),
  supervisorName: z.string().max(200).optional().nullable(),
  startDate: z.string().optional().nullable(), // YYYY-MM-DD
  contractorName: z.string().max(200).optional().nullable(),
  estimatedValue: z.number().nonnegative().optional().nullable(),
  currency: z.enum(CURRENCY).optional().nullable(),
  duration: z.string().max(200).optional().nullable(),
  status: z.enum(['قيد الدراسة', 'قيد التنفيذ', 'منجز', 'متوقف']).optional(),
  attachments: z.string().max(1000).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

const columns = [
  ['projectNumber', 'project_number'], ['name', 'name'], ['supervisorName', 'supervisor_name'],
  ['startDate', 'start_date'], ['contractorName', 'contractor_name'], ['estimatedValue', 'estimated_value'],
  ['currency', 'currency'], ['duration', 'duration'], ['status', 'status'],
  ['attachments', 'attachments'], ['notes', 'notes'],
];

const router = makeCrudRouter({
  table: 'projects',
  resourceKey: 'project',
  schema,
  columns,
  permissions: { read: 'projects.read', write: 'projects.write' },
});

module.exports = router;
