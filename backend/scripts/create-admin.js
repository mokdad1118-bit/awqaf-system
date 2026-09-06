/**
 * ينشئ أول حساب "مدير نظام" مباشرة في قاعدة البيانات، لأنه لا يوجد بعد أي
 * مستخدم يقدر يسجّل دخول وينشئ حسابات عبر الـ API. شغّله مرة واحدة فقط
 * بعد تطبيق schema.sql، من داخل مجلد backend:
 *
 *   node scripts/create-admin.js <username> <full_name> <password>
 *
 * مثال:
 *   node scripts/create-admin.js admin "مدير النظام" "P@ssw0rd-Strong-2026!"
 */
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { validatePasswordStrength } = require('../src/utils/password');

async function main() {
  const [username, fullName, password] = process.argv.slice(2);
  if (!username || !fullName || !password) {
    console.error('الاستخدام: node scripts/create-admin.js <username> <full_name> <password>');
    process.exit(1);
  }
  const strengthError = validatePasswordStrength(password);
  if (strengthError) {
    console.error('كلمة سر ضعيفة:', strengthError);
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const roleRes = await pool.query(`SELECT id FROM awqaf_sweida.roles WHERE code = 'admin'`);
    if (!roleRes.rows[0]) throw new Error('دور admin غير موجود — تأكد من تطبيق schema.sql أولاً');

    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO awqaf_sweida.users (username, full_name, password_hash, role_id, must_change_password)
       VALUES ($1,$2,$3,$4,false)`,
      [username, fullName, hash, roleRes.rows[0].id]
    );
    console.log(`تم إنشاء حساب المدير "${username}" بنجاح.`);
  } catch (err) {
    console.error('فشل إنشاء الحساب:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
