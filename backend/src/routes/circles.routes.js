const { z } = require('zod');
const { makeCrudRouter } = require('../utils/crudFactory');

const schema = z.object({
  name: z.string().min(2).max(300),
  mosqueId: z.string().uuid().optional().nullable(),
  teacherName: z.string().max(200).optional().nullable(),
  studentsCount: z.number().int().nonnegative().optional(),
  level: z.enum(['تمهيدي', 'متوسط', 'متقدم', 'تحفيظ كامل']).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

const columns = [
  ['name', 'name'], ['mosqueId', 'mosque_id'], ['teacherName', 'teacher_name'],
  ['studentsCount', 'students_count'], ['level', 'level'], ['notes', 'notes'],
];

module.exports = makeCrudRouter({
  table: 'quranic_circles',
  resourceKey: 'circle',
  schema,
  columns,
  permissions: { read: 'education.read', write: 'education.write' },
});
