const { z } = require('zod');
const { makeCrudRouter } = require('../utils/crudFactory');

const schema = z.object({
  name: z.string().min(2).max(300),
  location: z.string().max(300).optional().nullable(),
  directorName: z.string().max(200).optional().nullable(),
  studentsCount: z.number().int().nonnegative().optional(),
  notes: z.string().max(4000).optional().nullable(),
});

const columns = [
  ['name', 'name'], ['location', 'location'], ['directorName', 'director_name'],
  ['studentsCount', 'students_count'], ['notes', 'notes'],
];

module.exports = makeCrudRouter({
  table: 'sharia_schools',
  resourceKey: 'school',
  schema,
  columns,
  permissions: { read: 'education.read', write: 'education.write' },
});
