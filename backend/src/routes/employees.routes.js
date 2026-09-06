const { z } = require('zod');
const { makeCrudRouter } = require('../utils/crudFactory');

const schema = z.object({
  employeeNumber: z.string().min(1).max(50),
  fullName: z.string().min(2).max(200),
  nationalId: z.string().min(3).max(50),
  jobTitle: z.string().max(200).optional().nullable(),
  mosqueId: z.string().uuid().optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  city: z.string().max(200).optional().nullable(),
  salaryUsd: z.number().nonnegative().optional().nullable(),
  salarySyp: z.number().nonnegative().optional().nullable(),
  shamCashAccount: z.string().max(100).optional().nullable(),
  evaluation: z.enum(['مميز', 'ممتاز', 'جيد', 'وسط', 'ضعيف', 'ضعيف جداً']).optional().nullable(),
  sponsorship: z.enum(['كلية', 'جزئية', 'صندوق المسجد', 'جمعيات', 'غير مكفول']).optional().nullable(),
  quranMemorization: z.enum([
    'جزء 1-4', 'جزء 5-10', 'جزء 11-20', 'جزء 21-30', 'إجازة', 'إجازة بالقراءات العشر',
  ]).optional().nullable(),
  certificate: z.enum([
    'دكتوراه', 'ماجستير', 'إجازة في الشريعة', 'إجازة عامة', 'معهد متوسط شرعي',
    'معهد متوسط عام', 'ثانوية شرعية', 'ثانوية عامة', 'تعليم أساسي', 'لا يوجد شهادة',
  ]).optional().nullable(),
  status: z.enum([
    'قائم على رأس عمله', 'إجازة', 'مفصول مؤقت', 'مفصول نهائي', 'نقل ضمن المحافظة', 'نقل خارج المحافظة',
  ]).optional(),
  notes: z.string().max(4000).optional().nullable(),
});

const columns = [
  ['employeeNumber', 'employee_number'], ['fullName', 'full_name'], ['nationalId', 'national_id'],
  ['jobTitle', 'job_title'], ['mosqueId', 'mosque_id'], ['category', 'category'], ['city', 'city'],
  ['salaryUsd', 'salary_usd'], ['salarySyp', 'salary_syp'], ['shamCashAccount', 'sham_cash_account'],
  ['evaluation', 'evaluation'], ['sponsorship', 'sponsorship'], ['quranMemorization', 'quran_memorization'],
  ['certificate', 'certificate'], ['status', 'status'], ['notes', 'notes'],
];

// بيانات حساسة (رقم وطني، رواتب): القراءة والكتابة مقيّدة بصلاحية employees.read/write
// على مستوى الخادم، وبسياسات Row-Level Security على مستوى قاعدة البيانات أيضاً
// (طبقتا حماية مستقلتان). الحذف النهائي معطّل عمداً - استخدم تغيير "الحالة"
// إلى "مفصول نهائي" بدلاً من حذف السجل، حفاظاً على السجل التاريخي والتدقيق.
module.exports = makeCrudRouter({
  table: 'employees',
  resourceKey: 'employee',
  schema,
  columns,
  permissions: { read: 'employees.read', write: 'employees.write' },
  allowDelete: false,
});
