const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12; // توازن جيد بين الأمان والأداء لعام 2026

async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

/**
 * سياسة كلمة مرور قوية إلزامية: 10 أحرف على الأقل، وتحتوي حرفاً كبيراً
 * وحرفاً صغيراً ورقماً ورمزاً خاصاً على الأقل. يمنع كلمات المرور الشائعة/الضعيفة.
 */
const WEAK_PASSWORDS = new Set([
  '123456789', 'password', 'qwerty123', '111111111', 'admin1234', 'aa123456789',
]);

function validatePasswordStrength(pw) {
  if (typeof pw !== 'string' || pw.length < 10) {
    return 'يجب أن تتكون كلمة السر من 10 أحرف على الأقل';
  }
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) {
    return 'يجب أن تحتوي كلمة السر على حرف كبير وحرف صغير على الأقل';
  }
  if (!/[0-9]/.test(pw)) {
    return 'يجب أن تحتوي كلمة السر على رقم واحد على الأقل';
  }
  if (!/[^a-zA-Z0-9]/.test(pw)) {
    return 'يجب أن تحتوي كلمة السر على رمز خاص واحد على الأقل';
  }
  if (WEAK_PASSWORDS.has(pw.toLowerCase())) {
    return 'كلمة السر هذه ضعيفة ومعروفة، اختر كلمة سر أخرى';
  }
  return null; // صالحة
}

module.exports = { hashPassword, verifyPassword, validatePasswordStrength };
