const { z } = require('zod');
const { makeCrudRouter } = require('../utils/crudFactory');

const schema = z.object({
  statementNumber: z.string().min(1).max(100),
  statementDate: z.string().optional().nullable(),
  mosqueId: z.string().uuid().optional().nullable(),
  contractorName: z.string().max(200).optional().nullable(),
  region: z.string().max(200).optional().nullable(),
  engineerName: z.string().max(200).optional().nullable(),
  originalContractDate: z.string().optional().nullable(),
  todayDate: z.string().optional().nullable(),
  totalContractValue: z.number().nonnegative().optional().nullable(),
  paymentValue: z.number().nonnegative().optional().nullable(),
  completionPercentage: z.number().min(0).max(100).optional().nullable(),
  remainingPercentage: z.number().min(0).max(100).optional().nullable(),
  attachments: z.string().max(1000).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

const columns = [
  ['statementNumber', 'statement_number'], ['statementDate', 'statement_date'], ['mosqueId', 'mosque_id'],
  ['contractorName', 'contractor_name'], ['region', 'region'], ['engineerName', 'engineer_name'],
  ['originalContractDate', 'original_contract_date'], ['todayDate', 'statement_today_date'],
  ['totalContractValue', 'total_contract_value'], ['paymentValue', 'payment_value'],
  ['completionPercentage', 'completion_percentage'], ['remainingPercentage', 'remaining_percentage'],
  ['attachments', 'attachments'], ['notes', 'notes'],
];

module.exports = makeCrudRouter({
  table: 'engineer_statements',
  resourceKey: 'statement',
  schema,
  columns,
  permissions: { read: 'projects.read', write: 'projects.write' },
});
