# النشر التلقائي لـ TestPilot على qa.softbuild.nl

نشر يدوي مع `dry_run` أولًا، ثم نشر تلقائي بعد نجاح CI عند تفعيل `AUTO_DEPLOY=true`. **لم يُنفَّذ أي شيء على السيرفر**؛ هذه الملفات وهذا الدليل فقط. التثبيت الحالي: `/var/www/testpilot` على الفرع `dev` (يتتبع `origin/dev`)، مشروع Compose باسم `testpilot`، والصور `testpilot-api:<sha>` و`testpilot-web:<sha>`.

| الملف | الدور |
|---|---|
| `.github/workflows/deploy-production.yml` | workflow باسم **Deploy production**: `workflow_run` بعد نجاح `TestPilot checks`، و`workflow_dispatch` مع `dry_run` |
| `infra/deploy/testpilot-deploy.sh` | سكربت النشر على السيرفر، يُثبَّت باسم `/usr/local/sbin/testpilot-deploy` |
| `infra/deploy/selftest.sh` | اختبار غير متصل للسكربت (مستودعات Git حقيقية و`docker`/`curl` وهميان)، يعمل ضمن CI |

## كيف يعمل

1. **التشغيل التلقائي** يتطلب كل ما يلي معًا: نجاح `TestPilot checks`، وأن الحدث `push` على `dev` من هذا المستودع نفسه، وأن المتغير `AUTO_DEPLOY` يساوي `true`. يُمرَّر `head_sha` الذي اجتاز الفحوصات إلى السكربت.
2. **حماية من CI المتأخر:** السكربت يجلب `origin/dev` ويرفض (رمز خروج 3) إن لم يكن الـ SHA المطلوب هو رأس `dev` الآن، **قبل** أي تغيير. الـ workflow يعتبر ذلك «تخطّيًا» لا فشلًا، ويتولى التشغيل الأحدث نشر الإصدار الأحدث.
3. **منع التداخل:** مجموعة `concurrency: deploy-production` في GitHub (بدون إلغاء تشغيل جارٍ) و`flock` على السيرفر في `BACKUP_DIR/.deploy.lock` (رمز 75).
4. **`dry_run`** (الافتراضي في التشغيل اليدوي) يفحص: الأوامر وصلاحية Docker وإضافة Compose، ومجلد النسخ الاحتياطي (كتابة ومساحة حرة)، ومسار Git (الفرع `dev`، شجرة نظيفة، `fetch`، توفر الـ SHA، أنه رأس `dev` وأنه fast-forward)، وملف `infra/.env` (الوضع 600 والمفاتيح المطلوبة بلا طباعة قيمها)، وصلاحية إعداد Compose، وحاويات `testpilot` الجارية، ووجود صور الإصدار الحالي للعودة. **لا يبني ولا يشغّل ولا يعيد تشغيل ولا يلمس قاعدة البيانات.**
5. **النشر** (يستهدف `-p testpilot` صراحةً دائمًا): `git merge --ff-only` ← نسخ احتياطي لقاعدة البيانات والأدلة بـ `infra/backup.sh` ← بناء `testpilot-api:<sha7>` و`testpilot-web:<sha7>` (الوسوم السابقة تبقى ولا يُحذف شيء) ← `php artisan migrate --force` في حاوية مؤقتة ← `docker compose up -d --no-build --wait` ← فحص `/up` و`/api/health` على المنفذ المحلي (وفحص `APP_URL` كتحذير فقط). ثم يتحقق الـ workflow من `PUBLIC_HEALTH_URL` من الخارج. سجل كل عملية في `BACKUP_DIR/deployments.log` (بلا أسرار).

## متى تكون العودة متوافقة مع مخطط قاعدة البيانات

السكربت يقارن `backend/database/migrations` بين الإصدار الحي والجديد:

- **لا ملفات هجرة تغيّرت:** المخطط لم يتغير، فالصور السابقة متوافقة. عند فشل التحقق الصحي تتم **عودة تلقائية** إلى الوسم السابق وإرجاع شجرة Git، ويُسجَّل `FAILED-ROLLED-BACK`.
- **هجرات تغيّرت:** لا عودة تلقائية (قد يكون المخطط الجديد غير مفهوم للصور القديمة، أو `migrate:rollback` مدمرًا). يُسجَّل `FAILED-MANUAL`. الخيارات: إصلاح للأمام بإصدار جديد (مفضّل مع هجرات expand/contract)، أو استعادة النسخة الاحتياطية في قاعدة **جديدة معزولة** ثم التحويل بموافقة صريحة بعد قبول احتمال فقدان البيانات. لا تشغّل `migrate:rollback` يدويًا دون مراجعة.
- فشل **قبل** تغيير الحاويات (نسخ احتياطي أو بناء): الحاويات الحية لم تُمَسّ وتُستعاد شجرة Git.

يدويًا: `cd /var/www/testpilot/infra && RELEASE_TAG=<الوسم السابق> docker compose -p testpilot up -d --no-build --wait` ثم `git -C /var/www/testpilot reset --hard <الإصدار السابق>` (الشجرة نظيفة دائمًا). الصور المتاحة: `docker image ls testpilot-api`. التنظيف يدوي ومؤجل حتى تُقرّر سياسة الاحتفاظ.

## إعداد السيرفر (مرة واحدة، يدويًا)

استبدل القيم بين `< >`. نفّذ الأوامر بحساب يملك صلاحية `sudo`، **بعد** أن تراجع كل أمر.

```bash
# 1) افحص مالك المستودع الحالي وفكّر قبل أي chown (قد يستخدمه مستخدم آخر)
stat -c '%U:%G' /var/www/testpilot && git -C /var/www/testpilot status -sb

# 2) مستخدم نشر مخصص لـ TestPilot، بلا كلمة مرور
sudo adduser --disabled-password --gecos 'TestPilot deploy' tp-deploy
sudo usermod -aG docker tp-deploy        # انظر «صلاحيات Docker» أدناه
sudo chown -R tp-deploy: /var/www/testpilot   # فقط بعد التأكد أنه لا يكسر خدمة أخرى
sudo chmod 600 /var/www/testpilot/infra/.env

# 3) مجلد النسخ الاحتياطي الخاص
sudo install -d -m 700 -o tp-deploy -g tp-deploy /var/backups/testpilot

# 4) تثبيت السكربت (ملكية root، لا يعدّله tp-deploy). التثبيت الحالي على السيرفر أقدم ولا يحتوي الملف،
#    فنزّله بـ SHA محدد من GitHub (دون تحديث /var/www/testpilot)، وراجع محتواه قبل التثبيت
curl -fsSL https://raw.githubusercontent.com/AbbasCG/TestPilot/<SHA-من-dev>/infra/deploy/testpilot-deploy.sh -o /tmp/testpilot-deploy.sh
less /tmp/testpilot-deploy.sh
sudo install -o root -g root -m 0755 /tmp/testpilot-deploy.sh /usr/local/sbin/testpilot-deploy && rm /tmp/testpilot-deploy.sh

# 5) اختياري: إعدادات غير افتراضية (ملكية root، 0644)
sudo tee /etc/testpilot-deploy.env >/dev/null <<'EOF'
TESTPILOT_DIR=/var/www/testpilot
BACKUP_DIR=/var/backups/testpilot
EOF
```

**مفتاح SSH مخصص** (على جهازك، لا على السيرفر؛ لا تستخدم مفتاحًا لخدمة أخرى):

```bash
ssh-keygen -t ed25519 -f testpilot-deploy-key -N '' -C 'github-actions testpilot deploy'
```

ثم على السيرفر في `/home/tp-deploy/.ssh/authorized_keys` (سطر واحد، الوضع 600 والمجلد 700 وبملكية tp-deploy):

```text
command="/usr/local/sbin/testpilot-deploy",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-user-rc ssh-ed25519 AAAA...المفتاح العام... github-actions testpilot deploy
```

المفتاح يستطيع تنفيذ هذا السكربت فقط، والسكربت لا يقبل إلا `dry-run <sha40>` أو `deploy <sha40>`. بصمة السيرفر لتثبيتها (لا تقبل «أول اتصال» تلقائيًا): `ssh-keyscan -p <المنفذ> <المضيف>` وتحقق من البصمة من مصدر موثوق.

### صلاحيات Docker الفعلية

السكربت يحتاج: `docker info`، `docker compose` (config/ps/build/run/up/exec) على مشروع `testpilot`، و`docker inspect` و`docker image inspect`. صلاحية مجموعة `docker` **تعادل root على السيرفر** لأنها تتيح تركيب أي مسار. الحماية الفعلية هنا طبقات: مفتاح مقيّد بأمر واحد، وسكربت مملوك لـ root يتحقق من المدخلات، وبناء من `origin/dev` فقط (فرع محمي، دمج بمراجعة المالك). لا تمنح مفتاح النشر صلاحيات أخرى، ولا تستخدم الحساب نفسه لـ LifeOS أو n8n أو StageJacht. بديل أشد: Docker بدون root (rootless) لحساب مخصص، أو `sudo` مقيّد بالسكربت وحده؛ كلاهما يتطلب اختبارًا على هذا السيرفر قبل اعتماده.

## إعداد GitHub

في **Settings → Environments → New environment → `production`**: أضف Secrets:

| الاسم | القيمة |
|---|---|
| `DEPLOY_SSH_KEY` | محتوى المفتاح الخاص `testpilot-deploy-key` كاملًا |
| `DEPLOY_KNOWN_HOSTS` | سطر/أسطر `known_hosts` للسيرفر (من `ssh-keyscan` بعد التحقق من البصمة) |

في **Settings → Secrets and variables → Actions → Variables** (أو متغيرات البيئة `production`): `DEPLOY_HOST` و`DEPLOY_USER` (`tp-deploy`) و`DEPLOY_PORT` (اختياري، الافتراضي 22) و`PUBLIC_HEALTH_URL` (`https://qa.softbuild.nl/api/health`). **لا تُنشئ `AUTO_DEPLOY` الآن** (غيابه يعني معطّلًا)؛ عيّنه `true` فقط بعد نجاح `dry_run` والنشر اليدوي الأول. للإيقاف الفوري: احذفه أو اجعله `false`.

## الفرع الافتراضي وأين يجب أن يوجد ملف الـ workflow

`workflow_run` و`workflow_dispatch` يعملان **من نسخة الملف على الفرع الافتراضي (`main`)** وليس من `dev`؛ وتشغيل `workflow_run` يبدأ على آخر commit من `main` لا على الـ SHA المختبَر. لهذا:

- يجب أن يوجد `deploy-production.yml` على `main` ليعمل النشر التلقائي ولتظهر عملية التشغيل اليدوي في تبويب Actions. يحدث ذلك بدمجك `dev` في `main` كالمعتاد؛ لا تغيير لفرع الإنتاج ولا نشر عند الدمج (الـ workflow لا يعمل عند push على `main`، ولا يغيّر السيرفر المتتبّع لـ `dev`).
- الـ workflow لا يعتمد على `GITHUB_SHA` بل على `workflow_run.head_sha` (تشغيل تلقائي) أو رأس `dev` الذي يُجلب عبر API (يدوي)، ويتحقق السكربت منه على السيرفر.
- أي تعديل لاحق على الـ workflow لا يسري إلا بعد وصوله إلى `main`. السكربت نفسه يُنسخ إلى `/usr/local/sbin` يدويًا؛ عند تغيير منطقه أعد التثبيت (الـ dry_run ينبّه إن اختلفت النسخة المثبّتة عن المستودع).
- إن أضفت قيد «Deployment branches» على البيئة `production` فسيُقيَّم على الفرع الافتراضي لتشغيلات `workflow_run`، فاسمح بـ `main` فيها.

## أول تشغيل (بالترتيب)

1. أكمل إعداد السيرفر وGitHub أعلاه، وتأكد أن `infra/deploy/testpilot-deploy.sh` و`deploy-production.yml` موجودان على `main`.
2. **Actions → Deploy production → Run workflow**، `dry_run` مفعّل، `sha` فارغ. يجب أن ينتهي أخضر وتظهر كل بنود الفحص `ok`. أي `FAIL` يُصلح قبل المتابعة.
3. شغّله ثانيةً بإلغاء `dry_run` لأول نشر يدوي، وراقب السجل ثم `https://qa.softbuild.nl/api/health` وتسجيل الدخول.
4. بعد نجاحه عيّن `AUTO_DEPLOY=true`. أول دمج لاحق في `dev` يمرّ عبر CI ثم ينشر تلقائيًا.

## الحدود والمخاطر المعروفة

- لم يُجرَّب شيء على السيرفر الحقيقي؛ `selftest.sh` يغطي منطق السكربت (رفض المدخلات، dry_run بلا تغيير، SHA متأخر، شجرة متسخة، المسار الناجح، العودة التلقائية، عدم العودة مع الهجرات، القفل) بـ Docker وهمي، لا بناء الصور فعليًا.
- فحص `APP_URL` من السيرفر نفسه قد يفشل بسبب hairpin NAT؛ يُسجَّل تحذيرًا فقط، ويقوم الـ workflow بالفحص العام من الخارج.
- لا تنظيف تلقائي للصور القديمة ولا سياسة احتفاظ بالنسخ الاحتياطية بعد (قرار مالك مؤجل، انظر DEPLOYMENT_PLAN.md).
- السيرفر مشترك مع LifeOS وn8n وStageJacht: السكربت لا يستخدم `--remove-orphans` ولا `prune`، ولا يخاطب إلا مشروع `testpilot`.
