-- =====================================================================
--  نظام مديرية أوقاف السويداء — قاعدة البيانات (PostgreSQL 14+)
--  Schema: awqaf_sweida
--  ملاحظة أمنية مهمة: لا يوجد أي نظام "بدون ثغرات نهائياً" بشكل مطلق.
--  هذا التصميم يطبّق أفضل الممارسات المعروفة (defense in depth) لتقليل
--  المخاطر إلى أدنى حد ممكن، لكنه يحتاج أيضاً طبقة تطبيق (Backend API)
--  آمنة، واستضافة مُهيّأة بشكل صحيح (HTTPS/TLS، جدار حماية، نسخ احتياطي)
--  ومراجعة أمنية دورية. التفاصيل في نهاية الملف تحت "ملاحظات ما بعد النشر".
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) الإضافات المطلوبة
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- لتوليد UUID وتشفير عام
CREATE EXTENSION IF NOT EXISTS citext;     -- نصوص غير حساسة لحالة الأحرف (البريد/اسم المستخدم)

CREATE SCHEMA IF NOT EXISTS awqaf_sweida;
SET search_path TO awqaf_sweida, public;

-- ---------------------------------------------------------------------
-- 1) دوال مساعدة عامة
-- ---------------------------------------------------------------------

-- تحديث updated_at تلقائياً في أي جدول يملك هذا العمود
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 2) الأدوار والصلاحيات (RBAC على مستوى بيانات التطبيق)
-- ---------------------------------------------------------------------

CREATE TABLE roles (
  id            SMALLSERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,          -- مثال: admin, accountant, project_officer, viewer
  name_ar       TEXT NOT NULL,                 -- الاسم المعروض بالعربية
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO roles (code, name_ar, description) VALUES
  ('admin',            'مدير النظام',        'صلاحية كاملة على كل الأقسام وإدارة المستخدمين'),
  ('director',         'المدير المسؤول',      'اطلاع وموافقات على كامل بيانات المديرية'),
  ('accountant',       'محاسب',              'إدارة المعاملات المالية والصندوق والميزانية'),
  ('project_officer',  'مسؤول مشاريع',        'إدارة المشاريع والعقود وأوامر الصرف'),
  ('data_entry',       'موظف إدخال بيانات',   'إضافة وتعديل بيانات المساجد والحلقات والمدارس فقط'),
  ('viewer',           'مطالع (قراءة فقط)',   'اطلاع فقط دون تعديل');

CREATE TABLE permissions (
  id            SMALLSERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,   -- مثال: mosques.write, finance.write, finance.void, users.manage
  description   TEXT NOT NULL
);

INSERT INTO permissions (code, description) VALUES
  ('mosques.read',      'عرض بيانات المساجد'),
  ('mosques.write',     'إضافة/تعديل بيانات المساجد'),
  ('finance.read',      'عرض المعاملات المالية والصندوق'),
  ('finance.write',     'إضافة/تعديل معاملات مالية'),
  ('finance.void',      'إلغاء/تصفير معاملة مالية (بدلاً من الحذف النهائي)'),
  ('budgets.write',     'إدارة بنود الميزانية'),
  ('projects.read',     'عرض المشاريع والعقود وعروض الأسعار وكشوف المهندسين وأوامر الصرف'),
  ('projects.write',    'إدارة المشاريع والعقود وعروض الأسعار وكشوف المهندسين وأوامر الصرف'),
  ('education.read',    'عرض الحلقات القرآنية والمدارس الشرعية'),
  ('education.write',   'إدارة الحلقات القرآنية والمدارس الشرعية'),
  ('archive.read',      'عرض وثائق الأرشيف'),
  ('archive.write',     'إدارة وثائق الأرشيف'),
  ('employees.read',    'عرض سجلات موظفي التنمية الإدارية'),
  ('employees.write',   'إدارة سجلات موظفي التنمية الإدارية (بيانات حساسة)'),
  ('reports.read',      'عرض التقارير'),
  ('data.export',       'تصدير بيانات أي قسم إلى ملف Excel'),
  ('data.import',       'استيراد بيانات إلى النظام من ملف Excel'),
  ('users.manage',      'إدارة المستخدمين والأدوار والصلاحيات'),
  ('settings.manage',   'تعديل إعدادات المديرية'),
  ('audit.read',        'الاطلاع على سجل النشاطات الكامل');

CREATE TABLE role_permissions (
  role_id        SMALLINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id  SMALLINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ربط افتراضي معقول للأدوار بالصلاحيات (يمكن تعديله لاحقاً من واجهة الإدارة)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.code = 'admin';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'director' AND p.code IN
  ('mosques.read','finance.read','budgets.write','projects.read','projects.write',
   'education.read','education.write','archive.read','archive.write',
   'employees.read','reports.read','audit.read','data.export');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'accountant' AND p.code IN
  ('mosques.read','finance.read','finance.write','finance.void','budgets.write','reports.read');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'project_officer' AND p.code IN
  ('mosques.read','projects.read','projects.write','reports.read');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'data_entry' AND p.code IN
  ('mosques.write','mosques.read','education.write','education.read',
   'archive.write','archive.read','employees.write','employees.read');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'viewer' AND p.code IN
  ('mosques.read','finance.read','projects.read','education.read','archive.read','reports.read');

-- ---------------------------------------------------------------------
-- 3) المستخدمون (الموظفون)
-- ---------------------------------------------------------------------

CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username            CITEXT NOT NULL UNIQUE,
  email               CITEXT UNIQUE,
  full_name           TEXT NOT NULL,
  -- كلمة المرور تُخزَّن كـ hash فقط (bcrypt/argon2) من طبقة التطبيق.
  -- لا تخزّن أبداً كلمة مرور نصّية هنا.
  password_hash       TEXT NOT NULL,
  role_id             SMALLINT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  failed_login_count  INTEGER NOT NULL DEFAULT 0,
  locked_until        TIMESTAMPTZ,
  last_login_at       TIMESTAMPTZ,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT username_format CHECK (username ~ '^[a-zA-Z0-9_.]{3,50}$')
);

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- صلاحيات إضافية فردية تُمنح لمستخدم مُحدَّد فوق صلاحيات دوره الوظيفي
-- الافتراضية (مثال: محاسب عادي بدوره لا يملك تصدير Excel، لكن نمنحه هذه
-- الصلاحية تحديداً دون ترقيته لدور أعلى). الصلاحية الفعلية لأي مستخدم =
-- صلاحيات دوره ∪ هذه الصلاحيات الإضافية.
CREATE TABLE user_extra_permissions (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id SMALLINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted_by    UUID REFERENCES users(id),
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission_id)
);

-- جلسات الدخول (تسمح بإبطال جلسة/تسجيل خروج عن بعد ومراقبة الأجهزة المتصلة)
CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,   -- hash لتوكن الجلسة، وليس التوكن نفسه
  ip_address    INET,
  user_agent    TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- سجل محاولات الدخول (للكشف عن محاولات الاختراق وتفعيل القفل التلقائي)
CREATE TABLE login_attempts (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT NOT NULL,
  ip_address    INET,
  success       BOOLEAN NOT NULL,
  attempted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_attempts_username_time ON login_attempts(username, attempted_at DESC);

-- تخصيص موظف بمسجد/مساجد محددة (لتقييد رؤية المحاسب مثلاً على مسجده فقط)
CREATE TABLE user_mosque_access (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mosque_id   UUID NOT NULL, -- FK يُضاف بعد إنشاء جدول mosques أدناه
  PRIMARY KEY (user_id, mosque_id)
);

-- ---------------------------------------------------------------------
-- 4) المساجد
-- ---------------------------------------------------------------------

CREATE TYPE mosque_status AS ENUM (
  'جاهز','بانتظار الترميم','قيد الترميم','تم ترميمه',
  'قيد البناء','تم بناؤه','طوائف أخرى مفعل','طوائف أخرى غير مفعل'
);
CREATE TYPE mosque_category AS ENUM ('أ','ب','ج','د');
CREATE TYPE mosque_type AS ENUM ('عام','خاص','مركزي','عام أثري','مركزي أثري');
CREATE TYPE technical_condition AS ENUM ('ممتازة','جيدة','متوسطة','سيئة','سيئة جداً');
CREATE TYPE demolition_status AS ENUM ('غير مهدم','مهدم جزئياً','مهدم كلياً');

CREATE TABLE mosques (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  city_village          TEXT,
  location              TEXT,           -- مكان المسجد (الحي/الموقع التفصيلي)
  area_sqm              NUMERIC(10,2) CHECK (area_sqm IS NULL OR area_sqm >= 0),
  annexes               TEXT,           -- ملحقات المسجد
  imam_name             TEXT,
  khatib_name           TEXT,
  muezzin_name          TEXT,
  caretaker_name        TEXT,           -- خادم المسجد
  phone                 TEXT,
  category              mosque_category,
  type                  mosque_type,
  is_active             BOOLEAN NOT NULL DEFAULT true,   -- مفعّل
  friday_sermon         BOOLEAN NOT NULL DEFAULT false,  -- تقام خطبة الجمعة
  status                mosque_status NOT NULL DEFAULT 'جاهز',
  technical_condition   technical_condition,
  demolition_status     demolition_status NOT NULL DEFAULT 'غير مهدم',
  demolition_percentage SMALLINT CHECK (demolition_percentage IS NULL OR demolition_percentage IN (5,25,50,75,100)),
  notes                 TEXT,
  created_by            UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mosques_name_not_blank CHECK (btrim(name) <> '')
);
CREATE UNIQUE INDEX uq_mosques_name_location ON mosques (lower(name), lower(coalesce(location,'')));
CREATE TRIGGER trg_mosques_updated_at BEFORE UPDATE ON mosques
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE user_mosque_access
  ADD CONSTRAINT fk_uma_mosque FOREIGN KEY (mosque_id) REFERENCES mosques(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------
-- 5) التصنيفات المالية (Lookup) — لتفادي نصوص حرة غير متسقة
-- ---------------------------------------------------------------------

CREATE TABLE financial_categories (
  id      SMALLSERIAL PRIMARY KEY,
  name    TEXT NOT NULL UNIQUE,
  kind    TEXT NOT NULL CHECK (kind IN ('income','expense','both'))
);

INSERT INTO financial_categories (name, kind) VALUES
  ('تبرعات', 'income'), ('إيجارات أوقاف', 'income'), ('دعم حكومي', 'income'),
  ('رواتب', 'expense'), ('صيانة وترميم', 'expense'), ('فواتير خدمات', 'expense'),
  ('مصاريف إدارية', 'expense'), ('أخرى', 'both');

-- ---------------------------------------------------------------------
-- 6) المعاملات المالية (سجل مالي لا يُحذف نهائياً — يُلغى/يُصفَّر فقط)
-- ---------------------------------------------------------------------

CREATE TYPE currency_type      AS ENUM ('ليرة سورية','دولار أمريكي','يورو','ليرة تركية');
CREATE TYPE transaction_type   AS ENUM ('وارد','صادر');
CREATE TYPE payment_method     AS ENUM ('نقدي','مصرفي','حوالة');

CREATE TABLE transactions (
  id            BIGSERIAL PRIMARY KEY,
  tx_date       DATE NOT NULL,
  type          transaction_type NOT NULL,
  category_id   SMALLINT NOT NULL REFERENCES financial_categories(id) ON DELETE RESTRICT,
  mosque_id     UUID REFERENCES mosques(id) ON DELETE SET NULL,
  amount        NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency      currency_type NOT NULL DEFAULT 'ليرة سورية',
  method        payment_method NOT NULL DEFAULT 'نقدي',
  notes         TEXT,
  is_voided     BOOLEAN NOT NULL DEFAULT false,
  voided_by     UUID REFERENCES users(id),
  voided_at     TIMESTAMPTZ,
  void_reason   TEXT,
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT void_requires_reason CHECK (NOT is_voided OR void_reason IS NOT NULL)
);
CREATE INDEX idx_tx_date ON transactions(tx_date);
CREATE INDEX idx_tx_mosque ON transactions(mosque_id);
CREATE INDEX idx_tx_method ON transactions(method) WHERE NOT is_voided;
CREATE TRIGGER trg_tx_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- منع أي DELETE فعلي على المعاملات المالية على مستوى قاعدة البيانات
CREATE OR REPLACE FUNCTION prevent_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'الحذف النهائي غير مسموح لسجلات مالية. استخدم آلية الإلغاء (void) بدلاً من ذلك.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tx_no_delete BEFORE DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();

-- ---------------------------------------------------------------------
-- 7) الميزانية
-- ---------------------------------------------------------------------

CREATE TABLE budgets (
  id            BIGSERIAL PRIMARY KEY,
  fiscal_year   SMALLINT NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 2100),
  mosque_id     UUID REFERENCES mosques(id) ON DELETE SET NULL,
  category_id   SMALLINT NOT NULL REFERENCES financial_categories(id) ON DELETE RESTRICT,
  allocated_amount NUMERIC(14,2) NOT NULL CHECK (allocated_amount >= 0),
  currency      currency_type NOT NULL DEFAULT 'ليرة سورية',
  notes         TEXT,
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fiscal_year, mosque_id, category_id)
);

-- ---------------------------------------------------------------------
-- 8) المشاريع / عروض الأسعار / العقود / كشوف المهندسين / أوامر الصرف
-- ---------------------------------------------------------------------

CREATE TYPE project_status   AS ENUM ('قيد الدراسة','قيد التنفيذ','منجز','متوقف');
CREATE TYPE quote_status     AS ENUM ('مقدم','مقبول','مرفوض','منتهي الصلاحية');
CREATE TYPE contract_status  AS ENUM ('ساري','منتهي','قيد التجديد');
CREATE TYPE disbursement_status AS ENUM ('قيد المراجعة','معتمد','مصروف','مرفوض');

CREATE TABLE projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_number  TEXT NOT NULL,
  name            TEXT NOT NULL,
  supervisor_name TEXT,
  start_date      DATE,
  contractor_name TEXT,
  estimated_value NUMERIC(14,2) CHECK (estimated_value IS NULL OR estimated_value >= 0),
  currency        currency_type,
  duration        TEXT,
  status          project_status NOT NULL DEFAULT 'قيد الدراسة',
  attachments     TEXT,
  notes           TEXT,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_number)
);
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE price_quotes (
  id                    BIGSERIAL PRIMARY KEY,
  quote_number          TEXT NOT NULL,
  project_id            UUID REFERENCES projects(id) ON DELETE SET NULL,
  contractor_name       TEXT NOT NULL,
  contractor_address    TEXT,
  total_value           NUMERIC(14,2) CHECK (total_value IS NULL OR total_value >= 0),
  currency              currency_type,
  execution_duration    TEXT,
  supervising_engineer  TEXT,
  status                quote_status NOT NULL DEFAULT 'مقدم',
  condition_note        TEXT,  -- "وضعه"
  notes                 TEXT,
  created_by            UUID NOT NULL REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quote_number)
);
CREATE INDEX idx_price_quotes_project ON price_quotes(project_id);

CREATE TABLE contracts (
  id              BIGSERIAL PRIMARY KEY,
  contract_number TEXT NOT NULL,
  project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
  party_one       TEXT,
  party_two       TEXT NOT NULL,
  total_value     NUMERIC(14,2) CHECK (total_value IS NULL OR total_value >= 0),
  currency        currency_type,
  start_date      DATE,
  end_date        DATE,
  status          contract_status NOT NULL DEFAULT 'ساري',
  attachments     TEXT,
  notes           TEXT,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contract_dates_valid CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  UNIQUE (contract_number)
);
CREATE INDEX idx_contracts_project ON contracts(project_id);

CREATE TABLE engineer_statements (
  id                      BIGSERIAL PRIMARY KEY,
  statement_number        TEXT NOT NULL,
  statement_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  mosque_id               UUID REFERENCES mosques(id) ON DELETE SET NULL,
  contractor_name         TEXT,
  region                  TEXT,
  engineer_name           TEXT,
  original_contract_date  DATE,
  statement_today_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  total_contract_value    NUMERIC(14,2) CHECK (total_contract_value IS NULL OR total_contract_value >= 0),
  payment_value           NUMERIC(14,2) CHECK (payment_value IS NULL OR payment_value >= 0),
  completion_percentage   SMALLINT CHECK (completion_percentage IS NULL OR completion_percentage BETWEEN 0 AND 100),
  remaining_percentage    SMALLINT CHECK (remaining_percentage IS NULL OR remaining_percentage BETWEEN 0 AND 100),
  attachments             TEXT,
  notes                   TEXT,
  created_by              UUID NOT NULL REFERENCES users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (statement_number)
);
CREATE INDEX idx_engineer_statements_mosque ON engineer_statements(mosque_id);

CREATE TABLE disbursements (
  id                    BIGSERIAL PRIMARY KEY,
  disbursement_number   TEXT NOT NULL,
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  mosque_id             UUID NOT NULL REFERENCES mosques(id) ON DELETE RESTRICT,
  contract_id           BIGINT REFERENCES contracts(id) ON DELETE SET NULL,
  contractor_name       TEXT,
  amount                NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency              currency_type,
  disbursement_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  budget_item           TEXT,
  payment_method        payment_method NOT NULL DEFAULT 'نقدي',
  transfer_number       TEXT,
  status                disbursement_status NOT NULL DEFAULT 'قيد المراجعة',
  notes                 TEXT,
  attachments           TEXT,
  created_by            UUID NOT NULL REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (disbursement_number)
);
CREATE INDEX idx_disbursements_project ON disbursements(project_id);
CREATE INDEX idx_disbursements_mosque ON disbursements(mosque_id);

-- تحقق تلقائي: مجموع أوامر الصرف (غير المرفوضة) على مشروع لا يتجاوز قيمته التقديرية
CREATE OR REPLACE FUNCTION check_disbursement_within_budget()
RETURNS TRIGGER AS $$
DECLARE
  proj_budget NUMERIC(14,2);
  spent_so_far NUMERIC(14,2);
BEGIN
  SELECT estimated_value INTO proj_budget FROM projects WHERE id = NEW.project_id;
  IF proj_budget IS NOT NULL AND NEW.status <> 'مرفوض' THEN
    SELECT COALESCE(SUM(amount),0) INTO spent_so_far
      FROM disbursements
      WHERE project_id = NEW.project_id AND id <> COALESCE(NEW.id, -1) AND status <> 'مرفوض';
    IF spent_so_far + NEW.amount > proj_budget THEN
      RAISE EXCEPTION 'أمر الصرف يتجاوز القيمة التقديرية للمشروع (المتاح: %). ', proj_budget - spent_so_far;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_disbursement_budget_check
  BEFORE INSERT OR UPDATE ON disbursements
  FOR EACH ROW EXECUTE FUNCTION check_disbursement_within_budget();

-- ---------------------------------------------------------------------
-- 9) الحلقات القرآنية والمدارس الشرعية
-- ---------------------------------------------------------------------

CREATE TYPE circle_level AS ENUM ('تمهيدي','متوسط','متقدم','تحفيظ كامل');

CREATE TABLE quranic_circles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  mosque_id       UUID REFERENCES mosques(id) ON DELETE SET NULL,
  teacher_name    TEXT,
  students_count  INTEGER NOT NULL DEFAULT 0 CHECK (students_count >= 0),
  level           circle_level,
  notes           TEXT,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sharia_schools (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  location        TEXT,
  director_name   TEXT,
  students_count  INTEGER NOT NULL DEFAULT 0 CHECK (students_count >= 0),
  notes           TEXT,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 10) الأرشيف
-- ---------------------------------------------------------------------

CREATE TYPE archive_category AS ENUM ('إداري','مالي','مشاريع','مراسلات','عقود');

CREATE TABLE archive_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  category        archive_category NOT NULL,
  doc_date        DATE,
  notes           TEXT,
  file_reference  TEXT,  -- مسار/معرف الملف في نظام تخزين الملفات (ليس محتوى ثنائي في القاعدة)
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 10.5) التنمية الإدارية (سجل موظفي المديرية والمساجد)
-- ---------------------------------------------------------------------
-- تنبيه خصوصية: هذا الجدول يحتوي بيانات شخصية حساسة (رقم وطني، رواتب).
-- قيّد صلاحيتي employees.read / employees.write لأضيق مجموعة ممكنة من
-- الموظفين الفعليين، وفعّل تسجيل التدقيق (مُفعَّل تلقائياً أدناه).

CREATE TYPE evaluation_level    AS ENUM ('مميز','ممتاز','جيد','وسط','ضعيف','ضعيف جداً');
CREATE TYPE sponsorship_type    AS ENUM ('كلية','جزئية','صندوق المسجد','جمعيات','غير مكفول');
CREATE TYPE quran_memorization  AS ENUM ('جزء 1-4','جزء 5-10','جزء 11-20','جزء 21-30','إجازة','إجازة بالقراءات العشر');
CREATE TYPE certificate_level   AS ENUM (
  'دكتوراه','ماجستير','إجازة في الشريعة','إجازة عامة','معهد متوسط شرعي',
  'معهد متوسط عام','ثانوية شرعية','ثانوية عامة','تعليم أساسي','لا يوجد شهادة'
);
CREATE TYPE employee_status AS ENUM (
  'قائم على رأس عمله','إجازة','مفصول مؤقت','مفصول نهائي','نقل ضمن المحافظة','نقل خارج المحافظة'
);

CREATE TABLE employees (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_number     TEXT NOT NULL,
  full_name           TEXT NOT NULL,
  national_id         TEXT NOT NULL,
  job_title           TEXT,
  mosque_id           UUID REFERENCES mosques(id) ON DELETE SET NULL,
  category            TEXT,
  city                TEXT,
  salary_usd          NUMERIC(12,2) CHECK (salary_usd IS NULL OR salary_usd >= 0),
  salary_syp          NUMERIC(14,2) CHECK (salary_syp IS NULL OR salary_syp >= 0),
  sham_cash_account   TEXT,
  evaluation          evaluation_level,
  sponsorship         sponsorship_type,
  quran_memorization  quran_memorization,
  certificate         certificate_level,
  status              employee_status NOT NULL DEFAULT 'قائم على رأس عمله',
  notes               TEXT,
  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (national_id),
  UNIQUE (employee_number)
);
CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY employees_read_access ON employees
  FOR SELECT USING (current_setting('app.current_role', true) IN ('admin','director','data_entry'));
CREATE POLICY employees_write_access ON employees
  FOR INSERT WITH CHECK (current_setting('app.current_role', true) IN ('admin','data_entry'));
CREATE POLICY employees_update_access ON employees
  FOR UPDATE USING (current_setting('app.current_role', true) IN ('admin','data_entry'));

-- ---------------------------------------------------------------------
-- 11) سجل التدقيق الشامل (Audit Log) — تلقائي عبر Trigger عام
-- ---------------------------------------------------------------------

CREATE TABLE audit_log (
  id            BIGSERIAL PRIMARY KEY,
  table_name    TEXT NOT NULL,
  record_id     TEXT NOT NULL,
  action        TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  changed_by    UUID REFERENCES users(id),
  old_data      JSONB,
  new_data      JSONB,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_table_record ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_changed_at ON audit_log(changed_at DESC);

CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER AS $$
DECLARE
  actor UUID;
BEGIN
  -- يفترض أن طبقة التطبيق تضبط هذا المتغير عند فتح الاتصال:
  -- SELECT set_config('app.current_user_id', '<uuid>', true);
  BEGIN
    actor := current_setting('app.current_user_id', true)::UUID;
  EXCEPTION WHEN OTHERS THEN
    actor := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log(table_name, record_id, action, changed_by, new_data)
    VALUES (TG_TABLE_NAME, NEW.id::TEXT, 'INSERT', actor, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log(table_name, record_id, action, changed_by, old_data, new_data)
    VALUES (TG_TABLE_NAME, NEW.id::TEXT, 'UPDATE', actor, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log(table_name, record_id, action, changed_by, old_data)
    VALUES (TG_TABLE_NAME, OLD.id::TEXT, 'DELETE', actor, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- تفعيل التدقيق على الجداول الحساسة
CREATE TRIGGER audit_mosques    AFTER INSERT OR UPDATE OR DELETE ON mosques
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_transactions AFTER INSERT OR UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_budgets    AFTER INSERT OR UPDATE OR DELETE ON budgets
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_projects   AFTER INSERT OR UPDATE OR DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_contracts  AFTER INSERT OR UPDATE OR DELETE ON contracts
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_disbursements AFTER INSERT OR UPDATE OR DELETE ON disbursements
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_price_quotes AFTER INSERT OR UPDATE OR DELETE ON price_quotes
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_engineer_statements AFTER INSERT OR UPDATE OR DELETE ON engineer_statements
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_employees  AFTER INSERT OR UPDATE OR DELETE ON employees
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_circles    AFTER INSERT OR UPDATE OR DELETE ON quranic_circles
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_schools    AFTER INSERT OR UPDATE OR DELETE ON sharia_schools
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_archive    AFTER INSERT OR UPDATE OR DELETE ON archive_documents
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_users      AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- ---------------------------------------------------------------------
-- 12) إعدادات المديرية (صف واحد فقط مضمون عبر قيد)
-- ---------------------------------------------------------------------

CREATE TABLE settings (
  id                 BOOLEAN PRIMARY KEY DEFAULT true,
  ministry_name      TEXT NOT NULL DEFAULT 'وزارة الأوقاف السورية',
  directorate_name   TEXT NOT NULL DEFAULT 'مديرية أوقاف السويداء',
  currency_code      TEXT NOT NULL DEFAULT 'ل.س',
  updated_by         UUID REFERENCES users(id),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT settings_singleton CHECK (id)
);
INSERT INTO settings (id) VALUES (true);
CREATE TRIGGER trg_settings_updated_at BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- 13) أدوار قاعدة البيانات نفسها (Least Privilege على مستوى Postgres)
-- ---------------------------------------------------------------------
-- التطبيق يجب ألا يتصل بقاعدة البيانات بحساب superuser أو مالك القاعدة.
-- ينشئ حساب تطبيق محدود الصلاحيات فقط على الجداول التي يحتاجها.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'awqaf_app') THEN
    CREATE ROLE awqaf_app LOGIN PASSWORD 'CHANGE_ME_STRONG_RANDOM_SECRET';
  END IF;
END $$;

GRANT USAGE ON SCHEMA awqaf_sweida TO awqaf_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA awqaf_sweida TO awqaf_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA awqaf_sweida TO awqaf_app;
-- لا صلاحية DELETE للتطبيق على الجداول المالية إطلاقاً (الإلغاء منطقي فقط)
REVOKE DELETE ON transactions, budgets, contracts, disbursements FROM awqaf_app;
-- صلاحية الحذف الفعلي (لسجلات غير مالية فقط) تمنح لدور إداري منفصل عند الحاجة
-- REVOKE DELETE ON audit_log FROM awqaf_app;  -- سجل التدقيق للقراءة فقط من التطبيق
REVOKE INSERT, UPDATE, DELETE ON audit_log FROM awqaf_app;

-- ---------------------------------------------------------------------
-- 14) أمان على مستوى الصفوف (Row-Level Security) — مثال قابل للتفعيل
-- ---------------------------------------------------------------------
-- يفترض أن التطبيق يضبط عند بداية كل اتصال/جلسة:
--   SELECT set_config('app.current_user_id', '<uuid>', true);
--   SELECT set_config('app.current_role', '<role_code>', true);

ALTER TABLE mosques ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- المدراء والمحاسبون والمطالعون يرون كل شيء، أما بقية الموظفين
-- (مثال: موظف إدخال بيانات مرتبط بمسجد معين) فيرون فقط مساجدهم المخصصة.
CREATE POLICY mosques_full_access ON mosques
  FOR SELECT
  USING (
    current_setting('app.current_role', true) IN ('admin','director','accountant','viewer')
    OR EXISTS (
      SELECT 1 FROM user_mosque_access uma
      WHERE uma.mosque_id = mosques.id
        AND uma.user_id = current_setting('app.current_user_id', true)::UUID
    )
  );

CREATE POLICY mosques_write_access ON mosques
  FOR INSERT WITH CHECK (current_setting('app.current_role', true) IN ('admin','data_entry'));
CREATE POLICY mosques_update_access ON mosques
  FOR UPDATE USING (current_setting('app.current_role', true) IN ('admin','data_entry'));
CREATE POLICY mosques_delete_access ON mosques
  FOR DELETE USING (current_setting('app.current_role', true) = 'admin');

CREATE POLICY tx_full_access ON transactions
  FOR SELECT
  USING (
    current_setting('app.current_role', true) IN ('admin','director','accountant','viewer')
    OR (mosque_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_mosque_access uma
      WHERE uma.mosque_id = transactions.mosque_id
        AND uma.user_id = current_setting('app.current_user_id', true)::UUID
    ))
  );
CREATE POLICY tx_write_access ON transactions
  FOR INSERT WITH CHECK (current_setting('app.current_role', true) IN ('admin','accountant'));
CREATE POLICY tx_update_access ON transactions
  FOR UPDATE USING (current_setting('app.current_role', true) IN ('admin','accountant'));

COMMIT;

-- =====================================================================
--  ملاحظات ما بعد النشر (مهمة جداً — يرجى قراءتها)
-- =====================================================================
-- 1. هذا الملف هو طبقة قاعدة البيانات فقط. النظام "الجاهز للإطلاق" الحقيقي
--    يحتاج أيضاً: خادم تطبيق (Backend API) يتحقق من الجلسات والصلاحيات في
--    كل طلب، تشفير النقل عبر HTTPS/TLS، وإدارة أسرار (Secrets) بعيداً عن الكود.
-- 2. غيّر كلمة مرور الدور awqaf_app فوراً إلى قيمة عشوائية قوية ولا تضعها
--    في الكود المصدري؛ استخدم متغيرات بيئة (Environment Variables) أو
--    خدمة إدارة أسرار (Vault/Secrets Manager).
-- 3. فعّل نسخاً احتياطياً يومياً تلقائياً (pg_dump أو WAL archiving) واختبر
--    استعادته فعلياً بشكل دوري — نسخة احتياطية لم تُختبر استعادتها لا تُعتبر نسخة موثوقة.
-- 4. لا تمنح أي حساب تطبيقي صلاحية superuser أو صلاحية DROP/TRUNCATE.
-- 5. راجع صلاحيات RLS أعلاه وطوّرها بما يطابق الهيكل الإداري الفعلي
--    للمديرية قبل الاعتماد النهائي (من يرى ماذا، ومن يوقّع على ماذا).
-- 6. لا يوجد "صفر ثغرات" كضمان مطلق في أي نظام حقيقي؛ الأمان عملية
--    مستمرة: تحديثات دورية، مراقبة سجلات الدخول (login_attempts)،
--    قفل الحسابات بعد محاولات فاشلة متكررة، ومراجعة أمنية مستقلة قبل
--    الإطلاق الرسمي (خاصة إذا كان النظام سيُنشر على الإنترنت العام).
-- =====================================================================
