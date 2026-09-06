const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const env = require('./config/env');
const { generalApiLimiter } = require('./middleware/rateLimit');
const { errorHandler } = require('./middleware/errorHandler');
const routes = require('./routes');

const app = express();

// نثق بالوسيط العكسي (nginx/Caddy) لمعرفة الـ IP الحقيقي والبروتوكول (HTTPS) بشكل صحيح
if (env.trustProxy) app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'same-site' },
}));

app.use(cors({
  origin: env.corsOrigin, // نطاق واحد محدد فقط — وليس "*" أبداً مع الكوكيز
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(generalApiLimiter);

app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api', routes);

// أي مسار غير معروف
app.use((req, res) => res.status(404).json({ error: 'غير موجود' }));

app.use(errorHandler);

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`الخادم يعمل على المنفذ ${env.port} (${env.nodeEnv})`);
  if (env.nodeEnv !== 'production') {
    // eslint-disable-next-line no-console
    console.log('تنبيه: تأكد من تشغيل هذا خلف HTTPS حقيقي قبل أي استخدام إنتاجي.');
  }
});
