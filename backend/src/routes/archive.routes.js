const { z } = require('zod');
const { makeCrudRouter } = require('../utils/crudFactory');

const schema = z.object({
  title: z.string().min(2).max(300),
  category: z.enum(['إداري', 'مالي', 'مشاريع', 'مراسلات', 'عقود']),
  docDate: z.string().optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  fileReference: z.string().max(500).optional().nullable(),
});

const columns = [
  ['title', 'title'], ['category', 'category'], ['docDate', 'doc_date'],
  ['notes', 'notes'], ['fileReference', 'file_reference'],
];

module.exports = makeCrudRouter({
  table: 'archive_documents',
  resourceKey: 'document',
  schema,
  columns,
  permissions: { read: 'archive.read', write: 'archive.write' },
});
