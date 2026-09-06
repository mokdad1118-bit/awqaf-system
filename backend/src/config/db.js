const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseSsl ? { rejectUnauthorized: true } : false,
  max: 20,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  // اتصال معطوب في الخلفية — لا نُسقط العملية الكاملة، فقط نسجل الخطأ
  // eslint-disable-next-line no-console
  console.error('خطأ غير متوقع في اتصال قاعدة البيانات', err);
});

/**
 * ينفّذ دالة عمل ضمن معاملة واحدة (transaction)، بعد ضبط متغيرات الجلسة
 * app.current_user_id و app.current_role التي يعتمد عليها:
 *   - سجل التدقيق التلقائي (audit_log) في قاعدة البيانات
 *   - سياسات Row-Level Security المعرّفة في schema.sql
 * هذا يربط كل استعلام بهوية المستخدم الفعلي الذي أجرى الطلب، وليس فقط
 * بحساب التطبيق العام — بحيث لا يمكن لأي مستخدم أن "يتنكر" باسم آخر.
 */
async function withUserContext(user, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (user) {
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [user.id]);
      await client.query("SELECT set_config('app.current_role', $1, true)", [user.roleCode || '']);
    }
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, withUserContext };
