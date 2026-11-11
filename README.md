# TestPilot

مساحة عربية مستقلة لإدارة جودة المشاريع، مبنية على Laravel وReact وPostgreSQL.

**الحالة:** أساس عامل ومختبر للمصادقة والمشاريع والبيئات والأعضاء. وظائف السيناريوهات والتشغيل التعاوني لم تُنفّذ بعد؛ نص المرجع الرسمي PHASE 0–22 لم يصل. لا يوجد نشر أو Remote.

## التشغيل الحالي على Windows

المجلد: `D:\Projects\TestPilot`. قاعدة محلية خاصة على `127.0.0.1:55432`، وملفاتها في `.local/postgres` المستبعدة من Git.

```powershell
# من جذر المشروع، إذا لم تكن قاعدة البيانات تعمل:
.\infra\dev-db.ps1 start

# نافذة أولى:
cd backend
php artisan serve --host=127.0.0.1 --port=8000

# نافذة ثانية، من جذر المشروع:
cd frontend
npm run dev
```

افتح http://127.0.0.1:5173. أنشئ حسابًا من طرفية الخلفية:

```powershell
php artisan testpilot:user your-email@example.com --name="اسمك"
```

كلمة المرور تُطلب بشكل مخفي، ولا توجد كلمة مرور افتراضية للإنتاج. لا حاجة لتشغيل Apache أو MySQL أو XAMPP؛ يُستخدم برنامج PHP الموجود فقط.

## التحقق

```powershell
.\infra\test-postgres.ps1
cd frontend
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

اختبارات المتصفح تحتاج قاعدة `testpilot_e2e` وتهيئة BrowserTestSeeder كما في docs/DEVELOPMENT_SETUP.md. لا تستخدم قواعد التطوير أو الإنتاج لاختبارات RefreshDatabase.

## الوثائق

- [حالة التنفيذ](docs/IMPLEMENTATION_STATUS.md)
- [تشغيل البيئة وإعدادها](docs/DEVELOPMENT_SETUP.md)
- [متطلبات المصدر وتتبّعها](docs/REQUIREMENTS_TRACEABILITY.md)
- [المرجع الرسمي المنتظر](docs/MASTER_REQUIREMENTS.md)
- [واجهة API](docs/API_REFERENCE.md)
- [التسليم إلى Claude](docs/CLAUDE_HANDOFF.md)
- [خطة Hetzner](docs/DEPLOYMENT_PLAN.md)

ملفات Docker إعداد أولي فقط؛ محرك Docker المحلي غير شغّال، ولم تُبنَ الصور أو يُجرَّب النشر. لا تشغّل أي نشر قبل الموافقة وفحص خدمات VPS الموجودة.
