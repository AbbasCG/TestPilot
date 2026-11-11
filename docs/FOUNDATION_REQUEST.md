# TESTPILOT — CODEX FOUNDATION & IMPLEMENTATION MASTER PROMPT

## الهدف

أريد بدء بناء مشروع جديد ومستقل باسم **TestPilot**، وهو منصة SaaS لإدارة الاختبارات وضمان الجودة لجميع مشاريعي.

المشروع ليس خاصًا بثراء فقط. سيخدم ثراء وEMC وLifeOS وأي مشاريع أخرى مستقبلًا.

سأستخدم **Codex في المرحلة الأولى**، وبعدها سيكمل **Claude Code باستخدام Agency Agents وFrontend Design Skill**.

أريد منك بناء أساس حقيقي وعامل، مع توثيق دقيق يسمح لـClaude بإكمال المشروع دون تكرار العمل.

## 1. بيئة التطوير المحلية

أعمل على Windows.

أريد إنشاء المشروع على قرص منفصل عن C لأن مساحة C محدودة.

المسار المقترح:

`D:\Projects\TestPilot`

إذا كان المسار غير متاح، افحص الأقراص المتاحة واقترح مسارًا مناسبًا دون حذف أو نقل ملفات أخرى.

لا تستخدم `C:\xampp\htdocs`.

لا تفترض أن XAMPP ضروري.

افحص ما هو مثبت فعليًا:

- PHP وامتداداته المطلوبة.
- Composer.
- Node.js وnpm.
- PostgreSQL أو MySQL.
- Git.
- Docker، إن كان متاحًا.

استخدم الأدوات المثبتة عندما تكون مناسبة.

لا تثبت أدوات عالمية أو تغيّر PATH أو تنقل XAMPP دون حاجة وموافقة.

## 2. Project Structure

أنشئ بنية مستقلة:

```text
TestPilot/
  backend/
  frontend/
  docs/
  infra/
  .github/
  README.md
  CLAUDE.md
  .gitignore
```

استخدم مستودع Git مستقلًا عن جميع المشاريع الحالية.

لا تعدل مشاريع ثراء أو EMC أو LifeOS.

## 3. Technical Stack

Backend:
- Laravel API.
- PHP.
- Laravel Sanctum.
- REST API.
- Policies.
- Form Requests.
- API Resources.
- Services.
- Jobs and Queues.

Frontend:
- React.
- TypeScript.
- Vite.
- Tailwind CSS.
- React Router.
- TanStack Query.
- Form Validation.
- Lucide Icons.
- Motion عند الحاجة.

Database:
- PostgreSQL كخيار أول.
- قاعدة بيانات محلية خاصة بـTestPilot.

لا تستخدم قاعدة بيانات أي مشروع سابق.

استخدم الإصدارات المستقرة المتوافقة مع بعضها بعد فحص البيئة، ولا تفترض أرقام إصدارات غير مثبتة.

## 4. Product Requirements

اقرأ Master Prompt الخاص بمنصة TestPilot الذي سأوفره لك، ويحتوي على المراحل PHASE 0 إلى PHASE 22.

اعتبره المرجع الوظيفي الأساسي.

أريد تطبيقًا حقيقيًا، وليس Dashboard ببيانات Mock فقط.

## 5. Codex Implementation Scope

أريد منك البدء بتنفيذ:

### M1 — Foundation

- إعداد Laravel.
- إعداد React.
- إعداد قاعدة البيانات.
- المصادقة.
- الصلاحيات الأساسية.
- API Architecture.
- Design Tokens.
- Layout.
- Sidebar.
- Topbar.
- Arabic RTL.
- Light/Dark Mode.
- Error Handling.

### M2 — Project Management

- إنشاء مشروع.
- تعديل مشروع.
- قائمة المشاريع.
- مشروع مفرد.
- البيئات.
- أعضاء المشروع.
- صلاحيات أعضاء المشروع.
- لوحة تحكم أساسية ببيانات حقيقية.

### M3 — Test Management

- Test Suites.
- Test Cases.
- Test Steps.
- Prerequisites.
- Expected Results.
- Tester A / Tester B Roles.
- Scenario Builder.
- Templates.
- إنشاء وتعديل السيناريوهات.
- ترتيب خطوات السيناريو.
- ربط السيناريو بمشروع وبيئة واختبار.

### M4 — Collaborative Testing Foundation

إذا اكتملت M1–M3 بنجاح، ابدأ الأساس التقني لـ:

- Test Runs.
- Participants.
- Step Assignments.
- Shared Checkpoints.
- Per-Tester Step Results.
- Persistence.
- Activity Logging.

أريد اختبارًا تكامليًا أوليًا لشخصين، حتى إن بقيت بعض التحسينات المتقدمة لمرحلة Claude.

لا تؤجل جميع الوظائف الأساسية إلى Claude.

## 6. Frontend Design

أريد تصميمًا احترافيًا جدًا، باللغة العربية واتجاه RTL.

استخدم أي Skill تصميم مثبتة ومتاحة لـCodex إذا كانت مناسبة، ولا تدّعِ وجود Skill غير متاحة.

المظهر المطلوب:

- Modern Premium SaaS.
- Desktop-first.
- Responsive Mobile.
- Clean Typography.
- Strong Information Hierarchy.
- Subtle Motion.
- Accessible Components.
- Consistent UX.
- Professional Tables and Cards.

أريد صفحات حقيقية متصلة بالـAPI.

صمم خصوصًا:

1. Login.
2. Main Dashboard.
3. Projects.
4. Create Project Wizard.
5. Project Overview.
6. Test Suites.
7. Scenario Builder.
8. Test Case Detail.
9. Collaborative Test Runner.
10. Team Members.
11. Settings.

لا تملأ التصميم بعناصر غير عاملة.

## 7. Deployment Architecture — NEW REQUIREMENTS

سيتم استضافة التطبيق لاحقًا على:

**https://qa.softbuild.nl**

الاستضافة:

**Hetzner VPS**

قاعدة البيانات:

**PostgreSQL مستقلة على Hetzner.**

أريد إعدادًا منفصلًا تمامًا عن ثراء وEMC وLifeOS.

راجع إمكانية استخدام:

- Docker Compose.
- Nginx.
- Laravel PHP-FPM.
- React Static Build.
- PostgreSQL.
- Queue Worker.
- Scheduler.
- Private Persistent Storage.
- Environment Secrets.
- HTTPS / Let's Encrypt.
- Health Checks.
- Backups.
- Rollback.
- Deployment Logs.

إن كان Hetzner VPS يشغل Nginx أو Docker أو n8n أو خدمات أخرى، لا تغيّر إعداداتها أو منافذها دون فحص وموافقة.

استخدم نطاقًا واحدًا مع إمكانية توجيه:

- `/` إلى React.
- `/api` إلى Laravel.

تحقق من إعدادات Sanctum وCookies وCSRF وCORS في هذه البنية.

لا تفتح PostgreSQL للإنترنت.

لا تنفذ DNS Changes أو Deployment الآن.

جهّز فقط ملفات البنية التشغيلية وخطة النشر.

استبدل أي إشارة قديمة إلى `qa.tharaaplatform.com` بالنطاق الجديد `qa.softbuild.nl` في الوثائق والإعدادات المناسبة.

لا تجعل نطاق الإنتاج ثابتًا في الشيفرة.

## 8. Database & Security

أريد:

- Migrations صحيحة.
- Foreign Keys.
- Indexes.
- Unique Constraints.
- Role-Based Access.
- Project Isolation.
- Secure Sessions.
- Password Hashing.
- Rate Limiting.
- Audit Logs.
- Validation.
- File Security Design.
- Safe Concurrent Updates.

اختبر أن مختبرًا من مشروع A لا يستطيع قراءة اختبارات مشروع B.

وأن المختبر B لا يستطيع تعديل نتائج المختبر A دون صلاحية.

## 9. Quality Assurance

بعد كل مرحلة:

- شغّل اختبارات Backend.
- شغّل TypeScript Check.
- شغّل Frontend Build.
- اختبر API.
- اختبر المصادقة والصلاحيات.
- اختبر السيناريوهات الأساسية.
- راجع سلامة قاعدة البيانات.

أضف Playwright عند جاهزية المسارات الأساسية.

لا تعتبر أي مرحلة مكتملة دون اختبارات مناسبة.

## 10. Git Workflow

أنشئ Commits منطقية حسب مراحل التنفيذ.

لا تستخدم `git add .`.

لا تنشئ مستودع GitHub أو تدفع الشيفرة إلى Remote إلا بعد توفر الصلاحيات والموافقة المطلوبة.

لا تستخدم Force Push.

لا تنفذ Deployment.

## 11. Documentation & Claude Handoff

هذه المرحلة مهمة جدًا.

أنشئ وحدث:

- `README.md`
- `CLAUDE.md`
- `docs/PRODUCT_REQUIREMENTS.md`
- `docs/SYSTEM_ARCHITECTURE.md`
- `docs/DATABASE_DESIGN.md`
- `docs/API_REFERENCE.md`
- `docs/FRONTEND_DESIGN_SYSTEM.md`
- `docs/DEVELOPMENT_SETUP.md`
- `docs/DEPLOYMENT_PLAN.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/ROADMAP.md`
- `docs/CLAUDE_HANDOFF.md`

في `IMPLEMENTATION_STATUS.md` حدد:

- Complete.
- In Progress.
- Pending.
- Blocked.
- Known Issues.

وفي `CLAUDE_HANDOFF.md` اكتب:

1. ماذا بنيت فعليًا؟
2. ما الملفات والمكونات التي أنشأتها؟
3. كيف يعمل النظام؟
4. كيف أشغله محليًا؟
5. كيف أشغّل الاختبارات؟
6. ما آخر Commit؟
7. ما المشكلات المتبقية؟
8. ما القرارات المعمارية؟
9. ماذا يجب على Claude تنفيذه بعدك؟
10. ما الأعمال التي لا ينبغي إعادتها؟

ضع قائمة واضحة بالمهام التالية، مرتبة حسب الأولوية والاعتماديات.

## 12. Continuation Strategy

أريد منك أن تعمل عبر المراحل، وتواصل التنفيذ ما دامت الموارد متاحة.

إذا تعذر إكمال المشروع في الجلسة الحالية، اتركه في حالة مستقرة قابلة للتشغيل، وحدّث ملف التسليم.

لا تتوقف عند التخطيط فقط.

ولا تدّعِ نجاح أو تنفيذ شيء لم تتحقق منه.

## Final Output

أريد تقريرًا عربيًا يشمل:

- مسار المشروع.
- التقنيات والإصدارات.
- قاعدة البيانات.
- الصفحات المنفذة.
- API Endpoints.
- نتائج الاختبارات.
- حالة Git.
- المراحل المكتملة.
- ما الذي بقي.
- خطة الانتقال إلى Claude.
- جاهزية Hetzner وqa.softbuild.nl.

**ابدأ بفحص البيئة، ثم أنشئ TestPilot وابدأ بالتنفيذ الفعلي. لا تعدّل المشاريع الموجودة ولا تنشر التطبيق الآن.**