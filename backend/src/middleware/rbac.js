/**
 * يمنع أي طلب لا يملك صاحبه الصلاحية المطلوبة صراحةً.
 * "مدير النظام" (admin) يتجاوز كل التحقق لأنه يملك كل الصلاحيات حسب التصميم
 * في قاعدة البيانات (role_permissions تربطه بكل الصلاحيات).
 * يُستخدم دائماً بعد requireAuth في سلسلة الـ middleware.
 */
function requirePermission(permissionCode) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'يجب تسجيل الدخول' });
    }
    if (req.user.roleCode === 'admin') return next();
    if (req.user.permissions.includes(permissionCode)) return next();
    return res.status(403).json({ error: 'لا تملك صلاحية القيام بهذا الإجراء' });
  };
}

module.exports = { requirePermission };
