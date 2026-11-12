<?php

/*
 * Tharaa (ثراء) — first TestPilot project.
 *
 * Source (read-only, not modified): Tharaa_platforme/docs/demo/THARAA_DEMO_TEST_SCENARIOS.md
 * (verified 2026-11-11 against commit b7785e2, the build deployed on Demo) and
 * docs/audits/full-platform-review/10_MASTER_FINDINGS.md for THR-AUD-143.
 * Scenario codes in brackets (TCH-S01, PRM-10 …) refer to that document.
 *
 * Nothing here touches Tharaa's database or creates Tharaa accounts. Every
 * account below is created manually by a tester on Demo, with a strong
 * password chosen by the owner; no passwords are stored in TestPilot.
 */

$base = 'https://demo.tharaaplatform.com';

/**
 * Build ordered steps. Each step depends on the previous one unless it lists
 * explicit 1-based dependencies in 'after'.
 *
 * @param  string  $prefix  two hex digits that keep step UUIDs unique per scenario
 * @param  list<array<string, mixed>>  $rows
 * @return list<array<string, mixed>>
 */
$steps = function (string $prefix, array $rows) use ($base): array {
    $ids = [];
    $out = [];
    foreach ($rows as $index => $row) {
        $id = sprintf('7a4a%s00-0000-4000-8000-%012d', $prefix, $index + 1);
        $ids[$index + 1] = $id;
        $after = $row['after'] ?? ($index ? [$index] : []);
        $out[] = [
            'id' => $id,
            'type' => $row['type'],
            'title' => $row['title'],
            'assigned_role' => $row['role'],
            'url' => isset($row['path']) ? $base.$row['path'] : '',
            'target' => $row['target'] ?? '',
            'value' => $row['value'] ?? '',
            'expected_result' => $row['expected'],
            'instructions' => $row['instructions'] ?? '',
            'checkpoint' => $row['type'] === 'shared_checkpoint' ? $row['checkpoint'] : '',
            'evidence_required' => (bool) ($row['evidence'] ?? false),
            'depends_on' => array_map(fn (int $n) => $ids[$n], $after),
        ];
    }

    return $out;
};

$scenario = fn (array $fields) => array_merge([
    'description' => '', 'priority' => 'high', 'test_type' => 'functional', 'status' => 'ready',
    'required_account' => '', 'required_role' => '', 'test_data' => '', 'dependencies' => [],
    'is_template' => false, 'environment_id' => null,
], $fields);

return [
    'project' => [
        'name' => 'ثراء',
        'description' => "منصة ثراء للتعليم المالي.\nالبيئة: Demo (https://demo.tharaaplatform.com/)، فرع التطوير dev.\nالسيناريوهات مستوردة من docs/demo/THARAA_DEMO_TEST_SCENARIOS.md (تحقق 2026-11-11 على الإيداع b7785e2) دون تعديل مستودع ثراء أو قاعدة بياناته.",
        'environment' => ['name' => 'Demo — dev', 'url' => $base.'/'],
    ],
    'suites' => [
        [
            'name' => 'المؤسسات والمجموعات',
            'description' => 'دعوات المعلمين والطلاب، المجموعات، والترخيص (ORG-S04..S08، TCH-S01).',
            'scenarios' => [
                $scenario([
                    'title' => 'TEST-TEACHER-001 — إنشاء حساب معلّم ودعوته إلى مؤسسة وقبول الدعوة وربطه بمجموعة واختبار صلاحياته',
                    'priority' => 'critical', 'test_type' => 'integration',
                    'description' => 'سيناريو تعاوني بين مدير مؤسسة (Tester A) ومعلّم مدعو (Tester B). مأخوذ من ORG-S05..S07 وTCH-S01 وPRM-02/09/10.',
                    'objective' => 'التحقق من أن المعلّم المدعو بالبريد ينضم إلى المؤسسة بدور «معلم» ويُربط بالمجموعة الصحيحة، وأن صلاحياته محصورة في مساحة المعلّم.',
                    'prerequisites' => "1. مؤسسة معتمدة على Demo ولها ترخيص ساري بمقعد معلّم واحد على الأقل (ORG-S04). المؤسسة المعتمدة بعد 2026-10-25 بلا ترخيص لا تقبل أعضاء.\n2. حساب مدير المؤسسة مفعّل مسبقًا (ORG-S03 يتم قبل الاختبار لأن رابط التفعيل في السجل).\n3. بريد معلّم غير مستخدم سابقًا على Demo.\n4. THARAA_PILOT_ORGANIZATIONS فارغ وعلم الواجبات مفعّل.\n5. البريد غير متصل: لا يعتمد الاختبار على استلام أي رسالة.",
                    'required_account' => 'Tester A: مدير مؤسسة مفعّل. Tester B: يُنشئ حساب المعلّم يدويًا أثناء الاختبار.',
                    'required_role' => 'A: مدير مؤسسة (Org Admin). B: معلّم بعد قبول الدعوة.',
                    'test_data' => "بريد المعلّم: teacher.tp001@example.test (أو بريد جديد مماثل لكل تشغيل)\nاسم المعلّم: معلّم اختبار TP-001\nكلمة المرور: كلمة مرور قوية يحددها المالك (لا تُحفظ في TestPilot)\nالمجموعة: الصف الأول - أ (نوع: صف)\nبريد الرفض: other.tp001@example.test",
                    'expected_results' => 'عضوية معلّم نشطة في المؤسسة، مرتبطة بمجموعة «الصف الأول - أ»، تظهر «مساحة المعلّم» للمعلّم، والوصول إلى الإدارة والتقارير مرفوض له.',
                    'acceptance_criteria' => "• الدعوة لمرة واحدة ومقيدة بالبريد المدعو.\n• يرى الطرفان العضوية والدور نفسيهما بشكل مستقل.\n• المعلّم يرى المجموعة في «صفوفي» ولا يصل إلى /organizations/manage أو /organizations/reports أو /admin.\n• مدير المؤسسة لا يصل إلى /teach.\n• لا أخطاء 500 ولا تمرير أفقي.",
                    'steps' => $steps('01', [
                        ['type' => 'navigate', 'role' => 'A', 'title' => 'افتح «إدارة المؤسسة» وتحقق من الترخيص', 'path' => '/organizations/manage', 'expected' => 'تظهر التبويبات: نظرة عامة، الأعضاء، المجموعات، الدعوات… والترخيص «ساري» بمقعد معلّم متاح.', 'instructions' => 'إن ظهر «يتطلب ترخيصًا… لا يمكن قبول أعضاء جدد» فأوقف الاختبار وسجّله «متعذر».'],
                        ['type' => 'click', 'role' => 'A', 'title' => 'أنشئ المجموعة «الصف الأول - أ»', 'target' => 'المجموعات ← «＋ مجموعة جديدة»', 'value' => 'الاسم: الصف الأول - أ، النوع: صف', 'expected' => 'تظهر المجموعة الجديدة في قائمة المجموعات.'],
                        ['type' => 'input', 'role' => 'A', 'title' => 'أنشئ دعوة بدور «معلم/مسؤول» لبريد المعلّم', 'target' => 'الدعوات ← «＋ دعوة جديدة»', 'value' => 'الدور: معلم، البريد: teacher.tp001@example.test', 'expected' => 'رسالة «أُنشئت الدعوة. شارك الرمز مع المدعوين.» ويظهر رمز الانضمام.', 'evidence' => true, 'instructions' => 'التقط لقطة للرمز. سلّم الرمز لـ Tester B عبر قناة الفريق، لا عبر البريد.'],
                        ['type' => 'verify', 'role' => 'A', 'title' => 'تحقق من ظهور الدعوة معلّقة', 'expected' => 'الدعوة ظاهرة بالحالة المعلّقة والدور «معلم» والبريد المدعو.'],
                        ['type' => 'navigate', 'role' => 'B', 'title' => 'أنشئ حساب المعلّم يدويًا بالبريد المدعو نفسه', 'path' => '/register', 'value' => 'الاسم الكامل، البريد teacher.tp001@example.test، كلمة مرور قوية يحددها المالك', 'expected' => 'دخول تلقائي ورسالة «أهلاً بك في ثراء!» ثم التحويل إلى /onboarding.', 'after' => [], 'instructions' => 'لا تستخدم حسابًا حقيقيًا. أكمل المعالج بأقل الخيارات إن طُلب.'],
                        ['type' => 'wait_for_tester', 'role' => 'B', 'title' => 'انتظر رمز الدعوة من Tester A', 'expected' => 'استلمت الرمز الذي أنشأه مدير المؤسسة.', 'after' => [4, 5]],
                        ['type' => 'input', 'role' => 'B', 'title' => 'انضم بالرمز من «مؤسساتي»', 'path' => '/organizations', 'target' => '«الانضمام برمز»', 'expected' => 'تنجح العضوية ويظهر «مساحة المعلّم» (/teach) في القائمة.', 'evidence' => true],
                        ['type' => 'verify', 'role' => 'B', 'title' => 'جرّب الرمز نفسه بحساب ببريد آخر (اختبار سلبي)', 'value' => 'other.tp001@example.test (حساب تجريبي آخر)', 'expected' => 'يُرفض الرمز: الدعوة لمرة واحدة ومقيدة بالبريد المدعو.', 'instructions' => 'إن لم يتوفر حساب ثانٍ فسجّل الخطوة «متعذرة» مع السبب.'],
                        ['type' => 'verify', 'role' => 'A', 'title' => 'راجع «الأعضاء» وأضف المعلّم إلى المجموعة', 'target' => 'الأعضاء ثم المجموعات ← «إضافة عضو إلى مجموعة»', 'expected' => 'المعلّم نشط بدور «معلم» ومُضاف إلى «الصف الأول - أ».', 'after' => [7]],
                        ['type' => 'shared_checkpoint', 'role' => 'both', 'title' => 'العضوية والدور والمجموعة من الطرفين', 'expected' => 'يؤكد كل طرف بشكل مستقل العضوية والدور والمجموعة.', 'checkpoint' => 'هل أصبح المعلّم عضوًا في المؤسسة بدور «معلم» ومرتبطًا بمجموعة «الصف الأول - أ»؟ (A: من الأعضاء/المجموعة. B: من /teach ← «صفوفي»)', 'evidence' => true],
                        ['type' => 'navigate', 'role' => 'B', 'title' => 'المعلّم يحاول فتح إدارة المؤسسة والتقارير', 'path' => '/organizations/manage', 'value' => '/organizations/manage ثم /organizations/reports', 'expected' => '403 «ليس لديك صلاحية للوصول إلى هذه الصفحة» في الحالتين (PRM-10).'],
                        ['type' => 'navigate', 'role' => 'B', 'title' => 'المعلّم يحاول فتح لوحة الإدارة', 'path' => '/admin/dashboard', 'expected' => '403 (PRM-02) دون كشف بيانات.'],
                        ['type' => 'navigate', 'role' => 'A', 'title' => 'مدير المؤسسة يحاول فتح مساحة المعلّم', 'path' => '/teach', 'expected' => '403 (PRM-09).', 'after' => [10]],
                        ['type' => 'shared_checkpoint', 'role' => 'both', 'title' => 'حدود الصلاحيات', 'expected' => 'الصلاحيات محصورة لكل دور.', 'checkpoint' => 'هل رُفض وصول كل دور إلى صفحات الدور الآخر دون أخطاء 500 أو كشف بيانات؟', 'after' => [12, 13]],
                    ]),
                ]),
                $scenario([
                    'title' => 'THR-ORG-002 — دعوة طالب برمز مشترك والانضمام التلقائي إلى المجموعة',
                    'objective' => 'التحقق من أن رمز دعوة الطالب يضيفه إلى المؤسسة والمجموعة المحددة تلقائيًا (ORG-S07/S08).',
                    'prerequisites' => 'مؤسسة مرخّصة بمقاعد طلاب، مجموعة قائمة (من TEST-TEACHER-001 أو مماثلة)، حساب طالب تجريبي جديد.',
                    'required_account' => 'A: مدير مؤسسة. B: حساب طالب جديد يُنشأ يدويًا.',
                    'test_data' => "بريد الطالب: student.tp002@example.test\nالحد الأقصى للرمز: 5\nالمجموعة: الصف الأول - أ",
                    'expected_results' => 'الطالب عضو بدور «طالب» داخل المجموعة المحددة.',
                    'acceptance_criteria' => 'يظهر الطالب في «الأعضاء» وفي المجموعة، ويرى رسالة «تم انضمامك إلى ...».',
                    'steps' => $steps('02', [
                        ['type' => 'input', 'role' => 'A', 'title' => 'أنشئ دعوة طالب برمز مشترك مرتبطة بالمجموعة', 'path' => '/organizations/manage', 'target' => 'الدعوات ← «＋ دعوة جديدة»', 'value' => 'الدور: طالب، الحد الأقصى: 5، المجموعة: الصف الأول - أ', 'expected' => '«أُنشئت الدعوة. شارك الرمز مع المدعوين.»', 'evidence' => true],
                        ['type' => 'navigate', 'role' => 'B', 'title' => 'أنشئ حساب طالب جديد يدويًا', 'path' => '/register', 'expected' => 'دخول تلقائي وتحويل إلى /onboarding.', 'after' => []],
                        ['type' => 'input', 'role' => 'B', 'title' => 'انضم بالرمز', 'path' => '/organizations', 'target' => '«الانضمام برمز»', 'expected' => '«تم انضمامك إلى ...».', 'after' => [1, 2]],
                        ['type' => 'shared_checkpoint', 'role' => 'both', 'title' => 'عضوية الطالب ومجموعته', 'expected' => 'العضوية والمجموعة متطابقتان لدى الطرفين.', 'checkpoint' => 'هل يظهر الطالب في المجموعة المحددة بدور «طالب»؟'],
                    ]),
                ]),
            ],
        ],
        [
            'name' => 'التسجيل والتهيئة',
            'description' => 'إنشاء الحساب ومعالج الإعداد وطلب تسجيل مؤسسة (LRN-S01/S02، VIS-S06، ORG-S02).',
            'scenarios' => [
                $scenario([
                    'title' => 'THR-REG-001 — تسجيل متعلم جديد وإكمال معالج الإعداد بعملة JOD',
                    'objective' => 'التحقق من إنشاء حساب متعلم والدخول التلقائي وإكمال المعالج مع حفظ العملة دينار أردني.',
                    'prerequisites' => 'بريد جديد لكل تشغيل؛ mailer=log على Demo فلا يُنتظر بريد ترحيب.',
                    'required_account' => 'A: زائر ينشئ الحساب. B: مدير منصة للتحقق من المستخدم في /admin/users.',
                    'test_data' => "learner.tp-reg@example.test\nالعملة: دينار أردني\nهدف مالي واحد على الأقل",
                    'expected_results' => 'حساب جديد عملته JOD ويصل إلى /dashboard.',
                    'acceptance_criteria' => 'لا 500 عند التسجيل، المعالج يرفض المتابعة دون هدف، والمستخدم يظهر للمدير بالبيانات الصحيحة.',
                    'steps' => $steps('03', [
                        ['type' => 'input', 'role' => 'A', 'title' => 'سجّل حسابًا جديدًا', 'path' => '/register', 'value' => 'الاسم الكامل، البريد، كلمة مرور قوية يحددها المالك وتأكيدها', 'expected' => '«أهلاً بك في ثراء!» ثم /onboarding.'],
                        ['type' => 'verify', 'role' => 'A', 'title' => 'حاول المتابعة دون اختيار هدف', 'expected' => 'رسالة «يرجى اختيار هدف واحد على الأقل».'],
                        ['type' => 'select', 'role' => 'A', 'title' => 'أكمل المعالج واختر «دينار أردني»', 'expected' => 'بعد «إكمال إعداد الحساب» تظهر /dashboard بالعملة د.أ.', 'evidence' => true],
                        ['type' => 'navigate', 'role' => 'B', 'title' => 'ابحث عن المستخدم في لوحة الإدارة', 'path' => '/admin/users', 'expected' => 'يظهر الحساب الجديد بالاسم والبريد الصحيحين.', 'after' => [3]],
                        ['type' => 'shared_checkpoint', 'role' => 'both', 'title' => 'الحساب والعملة', 'expected' => 'يتطابق ما يراه الطرفان.', 'checkpoint' => 'هل الحساب نفسه ظاهر للطرفين وعملته الأساسية JOD؟'],
                    ]),
                ]),
                $scenario([
                    'title' => 'THR-REG-002 — طلب تسجيل مؤسسة واعتماده من مدير المنصة',
                    'objective' => 'التحقق من معالج «سجّل مؤسستك في ثراء» بخطواته الخمس، وظهور الطلب للمراجعة واعتماده (VIS-S06، ORG-S02).',
                    'prerequisites' => 'بيانات مؤسسة وهمية؛ حد 4 طلبات/ساعة لكل IP وبريد؛ تفضيل الدخول بحساب ليعمل رابط التتبع دون بريد.',
                    'required_account' => 'A: مستخدم داخل بحساب. B: مدير منصة.',
                    'test_data' => "النوع: مدرسة، الاسم الرسمي: مدرسة TestPilot التجريبية، الدولة/المدينة: الأردن/عمّان\nمقدّم الطلب: منسق اختبار، الهاتف: رقم تجريبي",
                    'expected_results' => 'رقم مرجعي بصيغة ORG-YYYY-XXXX ثم اعتماد ناجح.',
                    'acceptance_criteria' => 'المرجع ظاهر وتطابق المرجع لدى الطرفين؛ لا اعتماد على وصول البريد.',
                    'steps' => $steps('04', [
                        ['type' => 'input', 'role' => 'A', 'title' => 'املأ الخطوات 1–5 وأرسل الطلب', 'path' => '/organizations/apply', 'expected' => '«تم استلام طلب مؤسستكم» مع رقم مرجعي ORG-YYYY-XXXX.', 'evidence' => true],
                        ['type' => 'navigate', 'role' => 'B', 'title' => 'افتح طلبات المراجعة', 'path' => '/admin/organizations/review', 'expected' => 'يظهر الطلب بالمرجع نفسه.', 'after' => [1]],
                        ['type' => 'click', 'role' => 'B', 'title' => 'اعتمد الطلب', 'target' => 'صفحة الطلب ← اعتماد ← نافذة التأكيد', 'expected' => 'تنبيه نجاح. (معروف: «منذ منذ» مكرر في الرسالة — B8)'],
                        ['type' => 'shared_checkpoint', 'role' => 'both', 'title' => 'المرجع والحالة', 'expected' => 'تطابق المرجع والحالة.', 'checkpoint' => 'هل يطابق المرجع الذي رآه مقدّم الطلب المرجعَ المعتمد لدى المدير؟'],
                    ]),
                ]),
            ],
        ],
        [
            'name' => 'الأدوات المالية',
            'description' => 'الحسابات والمعاملات والتقسيم والميزانيات والأهداف، بأرقام القسم 3 من وثيقة ثراء (JOD، نوفمبر 2026).',
            'scenarios' => [
                $scenario([
                    'title' => 'THR-FIN-001 — الحسابات والمعاملات والتحويل مع الأرصدة المتوقعة',
                    'priority' => 'critical',
                    'objective' => 'التحقق من دقة الأرصدة بثلاث منازل بعد إدخال مجموعة البيانات E1–E8 بالترتيب (FIN-S02..S04).',
                    'prerequisites' => 'مستخدمان ماليان مستقلان بعملة JOD، تواريخ تُكتب يدويًا (UTC)، لا ضغط مزدوج على الحفظ.',
                    'required_account' => 'A: demo.fin.a@example.test. B: demo.fin.b@example.test (ينفذ المجموعة نفسها بشكل مستقل).',
                    'test_data' => "الحسابات: الحساب البنكي 500.000، المحفظة النقدية 100.000، حساب التوفير 100.000\nE1 دخل راتب 1200.000 (A1) 02/11 — E2 دخل عمل حر 150.000 (A2) — E3 أغذية 45.500 (A2) — E4 مواصلات 12.250 (A2) — E5 سكن 250.000 (A1) — E6 إنترنت 18.750 (A1) — E7 تحويل 300.000 من A1 إلى A3 — E8 تعليم 35.000 (A1)",
                    'expected_results' => 'بعد E8: A1 = 1,096.250، A2 = 192.250، A3 = 400.000، المجموع 1,688.500، دخل الشهر 1,350.000، مصروف الشهر 361.500.',
                    'acceptance_criteria' => 'تطابق كل الأرصدة الجدول 3.2 لدى المختبرين، والتحويل لا يغيّر الدخل ولا المصروف.',
                    'steps' => $steps('05', [
                        ['type' => 'input', 'role' => 'A', 'title' => 'أنشئ الحسابات الثلاثة', 'path' => '/accounts', 'expected' => '«إجمالي الأرصدة» 700.000 بلا كسور عائمة.'],
                        ['type' => 'input', 'role' => 'B', 'title' => 'أنشئ الحسابات الثلاثة على حسابك المستقل', 'path' => '/accounts', 'expected' => '«إجمالي الأرصدة» 700.000.', 'after' => []],
                        ['type' => 'input', 'role' => 'A', 'title' => 'أدخل E1–E8 بالترتيب', 'path' => '/transactions', 'expected' => 'بعد E8: 1,096.250 / 192.250 / 400.000.', 'after' => [1], 'evidence' => true],
                        ['type' => 'input', 'role' => 'B', 'title' => 'أدخل E1–E8 بالترتيب', 'path' => '/transactions', 'expected' => 'بعد E8: 1,096.250 / 192.250 / 400.000.', 'after' => [2], 'evidence' => true],
                        ['type' => 'compare', 'role' => 'both', 'title' => 'قارن لوحة التحكم', 'path' => '/dashboard', 'expected' => 'دخل 1,350.000، مصروف 361.500، صافي 988.500، معدل ادخار 73%.', 'after' => [3, 4]],
                        ['type' => 'shared_checkpoint', 'role' => 'both', 'title' => 'تطابق الأرصدة', 'expected' => 'نتيجتان مستقلتان متطابقتان.', 'checkpoint' => 'هل تطابق أرصدة الطرفين ومجموعها 1,688.500 الجدول المتوقع؟'],
                    ]),
                ]),
                $scenario([
                    'title' => 'THR-FIN-002 — تقسيم معاملة على حساب JOD (انحدار THR-AUD-143)',
                    'priority' => 'critical', 'test_type' => 'regression',
                    'description' => 'المشكلة المعروفة THR-AUD-143 (B1) غير محلولة: ما زال المتوقع الحالي على Demo هو الفشل. لا تُنفَّذ أثناء العرض أمام الجمهور.',
                    'objective' => 'التحقق من حفظ معاملة مقسّمة على حساب بثلاث منازل عشرية بعد إصلاح THR-AUD-143، ومقارنتها بحساب USD الضابط.',
                    'prerequisites' => 'مستخدم JOD ومستخدم مستقل بعملة USD (منزلتان). سجّل الإصدار المختبَر بدقة (b7785e2 حاليًا).',
                    'required_account' => 'A: مستخدم بعملة JOD. B: مستخدم بعملة USD.',
                    'test_data' => "مصروف 100.000 مقسّم «بالمبلغ»: الأغذية والمشروبات 60.000، الصحة 25.000، الترفيه 15.000\nلا تستخدم «بالتساوي» (B7).",
                    'expected_results' => 'تُحفظ المعاملة المقسّمة على JOD كما تُحفظ على USD.',
                    'acceptance_criteria' => 'نجاح الحفظ على JOD برسالة «تم إضافة المعاملة بنجاح». إن ظهرت «كل جزء يجب أن يكون مبلغًا أكبر من صفر…» فالنتيجة فاشلة وترتبط بـ THR-AUD-143.',
                    'steps' => $steps('06', [
                        ['type' => 'input', 'role' => 'A', 'title' => 'أنشئ مصروفًا 100.000 وفعّل «تقسيم على عدة تصنيفات» بالمبلغ', 'path' => '/transactions', 'expected' => 'الحالة الحية «✓ الأجزاء تساوي مبلغ المعاملة تمامًا — جاهزة للحفظ.»'],
                        ['type' => 'click', 'role' => 'A', 'title' => 'احفظ المعاملة', 'target' => '«حفظ المعاملة»', 'expected' => '«تم إضافة المعاملة بنجاح». (الحالي المعروف: رفض بسبب THR-AUD-143)', 'evidence' => true],
                        ['type' => 'input', 'role' => 'B', 'title' => 'نفّذ التقسيم نفسه على حساب USD (ضابط)', 'path' => '/transactions', 'value' => '100 = 60/25/15', 'expected' => 'تُحفظ المعاملة (FIN-S05b نجح محليًا).', 'after' => [], 'evidence' => true],
                        ['type' => 'shared_checkpoint', 'role' => 'both', 'title' => 'سلوك متطابق بين العملتين', 'expected' => 'نتيجة واحدة للعملتين.', 'checkpoint' => 'هل حُفظ التقسيم على JOD كما حُفظ على USD؟ إن لا، اربط الفشل بالمشكلة THR-AUD-143.', 'after' => [2, 3]],
                    ]),
                ]),
                $scenario([
                    'title' => 'THR-FIN-003 — الميزانيات والهدف وحاسبة الادخار',
                    'objective' => 'التحقق من نسب الميزانيات والتنبيه وتقدم الهدف وقيم الحاسبة (FIN-S07/S08/S12).',
                    'prerequisites' => 'THR-FIN-001 مكتمل، ثم E9a–E9c (بديل التقسيم) وE10.',
                    'required_account' => 'A: مستخدم مالي JOD. B: مراجع مستقل يحسب القيم من الجدول ويتحقق من اللقطات.',
                    'test_data' => "B1 «ميزانية الغذاء والمواصلات» 200.000 (أغذية 120، مواصلات 60)، B2 «ميزانية الترفيه والصحة» 100.000 (ترفيه 50، صحة 40)، تنبيه 80%\nهدف «رحلة العائلة» 500.000 حتى 31/12/2026، مساهمتان 150.000 و75.500\nالحاسبة: 1350/489",
                    'expected_results' => 'B1 59%، B2 63%، الهدف 45%، الحاسبة 861.000 د.أ و63.78%.',
                    'acceptance_criteria' => 'كل القيم مطابقة للقسم 3.3–3.5، وتنبيه «اقتربت من حد ميزانيتك» يظهر مرة واحدة.',
                    'steps' => $steps('07', [
                        ['type' => 'input', 'role' => 'A', 'title' => 'أنشئ الميزانيتين بالاسم يدويًا', 'path' => '/budgets', 'expected' => '«تم إنشاء الميزانية بنجاح» مرتين.'],
                        ['type' => 'input', 'role' => 'A', 'title' => 'أدخل E9a–E9c وE10', 'path' => '/transactions', 'expected' => 'B1 59% مع إشعار واحد، B2 63%.', 'evidence' => true],
                        ['type' => 'input', 'role' => 'A', 'title' => 'أنشئ الهدف وأضف المساهمتين', 'path' => '/goals', 'expected' => '225.500 / 500.000 = 45%. لا تفتح صفحة الهدف المفردة (منزلتان).'],
                        ['type' => 'compare', 'role' => 'B', 'title' => 'تحقق مستقلًا من الحاسبة', 'path' => '/savings-calculator', 'value' => 'الدخل 1350، المصروفات 489', 'expected' => '861.000 د.أ، 63.78%، سنوي 10,332.000.', 'after' => []],
                        ['type' => 'shared_checkpoint', 'role' => 'both', 'title' => 'تطابق المؤشرات', 'expected' => 'القيم المعروضة تطابق الحساب المستقل.', 'checkpoint' => 'هل تطابق نسب الميزانيات والهدف والحاسبة القيم المحسوبة يدويًا؟', 'after' => [3, 4]],
                    ]),
                ]),
            ],
        ],
        [
            'name' => 'التعلم والتقييم',
            'description' => 'التسجيل في الدورات، الدروس بالتسلسل، الاختبارات، الشهادات، وواجبات المعلم (LRN، TCH).',
            'scenarios' => [
                $scenario([
                    'title' => 'THR-LRN-001 — من التسجيل في الدورة إلى الشهادة والتحقق العام منها',
                    'objective' => 'التحقق من فتح الدروس بالتسلسل، والرسوب ثم النجاح في الاختبار، وإصدار شهادة يمكن لزائر التحقق منها (LRN-S03..S09a، EDG-01، VIS-S07).',
                    'prerequisites' => 'دورة منشورة بمحتوى عربي حقيقي (B2)، اختبار بدرجة نجاح 60% و3 محاولات، certificate_enabled=true.',
                    'required_account' => 'A: متعلم. B: زائر (نافذة خاصة دون دخول).',
                    'test_data' => 'لا ترسل الاختبار فارغًا (B6). احفظ رمز التحقق من /certificates.',
                    'expected_results' => 'إكمال الدورة وشهادة THR-2026-XXXXXXXX قابلة للتحقق علنًا.',
                    'acceptance_criteria' => 'الدرس اللاحق مقفل حتى إكمال السابق، الرسوب لا يكمل الدرس، والتحقق العام يعرض الحامل والدورة.',
                    'steps' => $steps('08', [
                        ['type' => 'click', 'role' => 'A', 'title' => 'سجّل في الدورة', 'path' => '/courses', 'target' => '«التسجيل في الدورة»', 'expected' => '«تم التسجيل في الدورة بنجاح» والتحويل إلى /courses/{id}/learn.'],
                        ['type' => 'navigate', 'role' => 'A', 'title' => 'افتح رابط درس لاحق مباشرة', 'expected' => 'تحويل مع «يجب إكمال الدرس السابق أولاً للمتابعة.» (EDG-01)'],
                        ['type' => 'verify', 'role' => 'A', 'title' => 'أجب إجابات خاطئة ثم صحيحة', 'expected' => '«لم تنجح هذه المرة» ثم «مبروك! نجحت في الاختبار» ويُفتح الدرس التالي.', 'evidence' => true],
                        ['type' => 'capture_evidence', 'role' => 'A', 'title' => 'أكمل الدورة واحفظ رمز الشهادة', 'path' => '/certificates', 'expected' => 'شهادة برقم THR-2026-XXXXXXXX.', 'evidence' => true],
                        ['type' => 'wait_for_tester', 'role' => 'B', 'title' => 'استلم رمز التحقق', 'expected' => 'الرمز متاح لدى الزائر.', 'after' => [4]],
                        ['type' => 'navigate', 'role' => 'B', 'title' => 'تحقق علنًا من الشهادة', 'value' => '/verify/{verification_code}', 'expected' => 'اسم الحامل والدورة والتاريخ والرمز.'],
                        ['type' => 'shared_checkpoint', 'role' => 'both', 'title' => 'تطابق الشهادة', 'expected' => 'البيانات متطابقة.', 'checkpoint' => 'هل تطابق بيانات الشهادة العامة ما يراه المتعلم في «شهاداتي»؟'],
                    ]),
                ]),
                $scenario([
                    'title' => 'THR-LRN-002 — واجب المعلّم: إسناد وتسليم وتقييم',
                    'objective' => 'التحقق من دورة الواجب بين المعلّم والطالب (TCH-S04، LRN-S11).',
                    'prerequisites' => 'TEST-TEACHER-001 وTHR-ORG-002 مكتملان، THARAA_FEATURE_ASSIGNMENTS=true.',
                    'required_account' => 'A: المعلّم. B: الطالب في المجموعة.',
                    'test_data' => 'ملف تسليم PDF صغير غير حساس (حتى 10 MB)، الدرجة 85%.',
                    'expected_results' => 'يرى الطالب الدرجة 85% والملاحظة.',
                    'acceptance_criteria' => 'الإشعار يصل للطالب، التسليم محفوظ، والدرجة ظاهرة للطرفين.',
                    'steps' => $steps('09', [
                        ['type' => 'input', 'role' => 'A', 'title' => 'أنشئ واجبًا وأسنده للصف', 'path' => '/teach', 'target' => '«الواجبات» ← «＋ واجب جديد» ← «إسناد للصف»', 'expected' => 'الواجب مسند إلى «الصف الأول - أ».'],
                        ['type' => 'upload', 'role' => 'B', 'title' => 'سلّم الواجب', 'path' => '/assignments', 'expected' => 'التسليم محفوظ ويظهر للمعلّم.', 'after' => [1], 'evidence' => true],
                        ['type' => 'input', 'role' => 'A', 'title' => 'قيّم التسليم', 'target' => '«فتح» ← «مراجعة» ← الدرجة 85% وملاحظة ← «حفظ الدرجة»', 'expected' => 'تُحفظ الدرجة.', 'after' => [2]],
                        ['type' => 'shared_checkpoint', 'role' => 'both', 'title' => 'الدرجة والملاحظة', 'expected' => 'يتطابق ما يراه الطرفان.', 'checkpoint' => 'هل يرى الطالب الدرجة 85% والملاحظة نفسها التي حفظها المعلّم؟'],
                    ]),
                ]),
            ],
        ],
        [
            'name' => 'الصلاحيات والعزل',
            'description' => 'حماية المسارات وعزل المؤسسات والمجموعات (PRM).',
            'scenarios' => [
                $scenario([
                    'title' => 'THR-PRM-001 — حماية المسارات للزائر وغير المدير',
                    'priority' => 'critical', 'test_type' => 'security',
                    'objective' => 'التحقق من تحويل الزائر إلى الدخول ورفض الأدوار غير المخولة (PRM-01/02/03/05/08/09/10).',
                    'prerequisites' => 'حسابات متعلم ومعلم ومدير مؤسسة ومدير منصة عادي (ليس أعلى).',
                    'required_account' => 'A: زائر ثم متعلم. B: مدير منصة عادي ثم معلّم.',
                    'test_data' => '/dashboard، /transactions، /admin/dashboard، /admin/users، /admin/permissions، POST /admin/users/{id}/impersonate',
                    'expected_results' => 'تحويل /login للزائر و403 للأدوار غير المخولة.',
                    'acceptance_criteria' => 'لا كشف بيانات ولا 500، ورسالة «ليس لديك صلاحية للوصول إلى هذه الصفحة».',
                    'steps' => $steps('10', [
                        ['type' => 'navigate', 'role' => 'A', 'title' => 'زائر يفتح صفحات محمية', 'path' => '/dashboard', 'expected' => 'تحويل إلى /login لكل صفحة محمية (PRM-01).'],
                        ['type' => 'navigate', 'role' => 'A', 'title' => 'متعلم يفتح /admin/users', 'path' => '/admin/users', 'expected' => '403 (PRM-02).'],
                        ['type' => 'navigate', 'role' => 'B', 'title' => 'مدير عادي يفتح الصلاحيات', 'path' => '/admin/permissions', 'expected' => '403 (PRM-03).', 'after' => []],
                        ['type' => 'custom_action', 'role' => 'B', 'title' => 'مدير عادي يحاول «الدخول كمستخدم»', 'expected' => '403 (PRM-05) ولا يبدأ أي انتحال.'],
                        ['type' => 'shared_checkpoint', 'role' => 'both', 'title' => 'لا تسرب بيانات', 'expected' => 'كل الرفض متسق.', 'checkpoint' => 'هل رُفضت كل المحاولات دون كشف بيانات أو أخطاء 500؟', 'after' => [2, 4]],
                    ]),
                ]),
                $scenario([
                    'title' => 'THR-PRM-002 — عزل مؤسستين ومجموعات المعلّم',
                    'priority' => 'critical', 'test_type' => 'security',
                    'description' => 'PRM-06/07 لم تُنفَّذ في وثيقة ثراء؛ هذا السيناريو يغطيها.',
                    'objective' => 'التحقق من أن مدير مؤسسة لا يرى بيانات مؤسسة أخرى، وأن المعلّم لا يرى مجموعات لم يُسند إليها.',
                    'prerequisites' => 'مؤسستان مرخّصتان X وY، معلّم في X مسند لمجموعة واحدة فقط.',
                    'required_account' => 'A: مدير المؤسسة X ثم معلّم X. B: مدير المؤسسة Y.',
                    'test_data' => 'معرّفات أعضاء/مجموعات/واجبات من المؤسسة الأخرى (تُنسخ من الواجهة لا من قاعدة البيانات).',
                    'expected_results' => 'رفض 403/404 لكل وصول عبر المؤسسات أو المجموعات.',
                    'acceptance_criteria' => 'لا يظهر أي اسم أو عدد أو تقرير من المؤسسة الأخرى.',
                    'steps' => $steps('11', [
                        ['type' => 'capture_evidence', 'role' => 'A', 'title' => 'سجّل روابط موارد المؤسسة X', 'path' => '/organizations/manage', 'expected' => 'قائمة روابط مجموعات وواجب من X.', 'evidence' => true],
                        ['type' => 'capture_evidence', 'role' => 'B', 'title' => 'سجّل روابط موارد المؤسسة Y', 'path' => '/organizations/manage', 'expected' => 'قائمة روابط من Y.', 'after' => [], 'evidence' => true],
                        ['type' => 'navigate', 'role' => 'A', 'title' => 'افتح روابط Y بحساب X', 'expected' => '403/404 دون بيانات.', 'after' => [1, 2]],
                        ['type' => 'navigate', 'role' => 'B', 'title' => 'افتح روابط X بحساب Y', 'expected' => '403/404 دون بيانات.', 'after' => [1, 2]],
                        ['type' => 'navigate', 'role' => 'A', 'title' => 'المعلّم يفتح واجب مجموعة غير مسندة إليه', 'expected' => 'مرفوض (PRM-23).', 'after' => [3]],
                        ['type' => 'shared_checkpoint', 'role' => 'both', 'title' => 'العزل', 'expected' => 'العزل محكم من الجهتين.', 'checkpoint' => 'هل رُفض كل وصول عبر المؤسستين ومن خارج مجموعة المعلّم؟', 'after' => [4, 5]],
                    ]),
                ]),
            ],
        ],
        [
            'name' => 'الهاتف وكفاح',
            'description' => 'تجربة الهاتف العربية RTL عند 390px، وجولات «كفاح» الإرشادية.',
            'scenarios' => [
                $scenario([
                    'title' => 'THR-MOB-001 — الصفحات الأساسية على الهاتف 390px RTL',
                    'test_type' => 'usability',
                    'objective' => 'التحقق من الاتجاه العربي وعدم وجود تمرير أفقي على الصفحات الأساسية (القسم 5).',
                    'prerequisites' => 'هاتف حقيقي أو محاكاة 390×844 بلمس، وحساب متعلم مالي ومعلم.',
                    'required_account' => 'A: هاتف. B: سطح مكتب 1440×900 للمقارنة.',
                    'test_data' => 'الصفحات: /، /login، /dashboard، /transactions، /accounts، /budgets، /goals، /teach، /organizations/manage',
                    'expected_results' => 'dir=rtl وscrollWidth = 390 في كل صفحة.',
                    'acceptance_criteria' => 'لا تمرير أفقي، الأزرار الأساسية بعرض كامل، والمحتوى نفسه متاح على الجهازين.',
                    'steps' => $steps('12', [
                        ['type' => 'navigate', 'role' => 'A', 'title' => 'افتح الصفحات العامة والمالية على الهاتف', 'path' => '/', 'expected' => 'لا تمرير أفقي، والقائمة السفلية لا تخفي الأزرار.', 'evidence' => true],
                        ['type' => 'navigate', 'role' => 'A', 'title' => 'افتح مساحة المعلّم وإدارة المؤسسة على الهاتف', 'path' => '/teach', 'expected' => 'التبويبات قابلة للاستخدام باللمس.', 'evidence' => true],
                        ['type' => 'compare', 'role' => 'B', 'title' => 'قارن الصفحات نفسها على سطح المكتب', 'expected' => 'المحتوى والإجراءات متطابقة.', 'after' => []],
                        ['type' => 'shared_checkpoint', 'role' => 'both', 'title' => 'تكافؤ الهاتف وسطح المكتب', 'expected' => 'تجربة متكافئة.', 'checkpoint' => 'هل كل إجراء متاح على سطح المكتب متاح على الهاتف دون تمرير أفقي؟', 'after' => [2, 3]],
                    ]),
                ]),
                $scenario([
                    'title' => 'THR-KFH-001 — جولات «كفاح» الإرشادية وبطاقات المساعدة',
                    'status' => 'draft', 'priority' => 'medium', 'test_type' => 'usability',
                    'description' => 'مسودة: وفق وثيقة ثراء (B11) جولات كفاح (PRs 40 و41) غير منشورة على Demo. لا تُعتمد قبل نشرها والتحقق منها.',
                    'objective' => 'التحقق من ظهور جولة «كفاح» وإمكانية إنهائها وعدم تكرارها بعد الإكمال.',
                    'prerequisites' => 'نشر PRs 40 و41 على Demo وتأكيد ذلك من المالك.',
                    'required_account' => 'A: متعلم جديد. B: متعلم جديد على الهاتف.',
                    'test_data' => 'حسابان جديدان لم يشاهدا الجولة.',
                    'expected_results' => 'تبدأ الجولة وتنتهي وتُحفظ حالتها.',
                    'acceptance_criteria' => 'زر «ابدأ الجولة» يعمل على الجهازين، ولا تعود الجولة بعد إنهائها.',
                    'steps' => $steps('13', [
                        ['type' => 'click', 'role' => 'A', 'title' => 'ابدأ الجولة وأكملها على سطح المكتب', 'path' => '/dashboard', 'target' => '«ابدأ الجولة»', 'expected' => 'تمر الجولة بكل البطاقات ثم تُغلق.'],
                        ['type' => 'click', 'role' => 'B', 'title' => 'ابدأ الجولة وأكملها على الهاتف', 'path' => '/dashboard', 'target' => '«ابدأ الجولة»', 'expected' => 'البطاقات مقروءة RTL ولا تخرج عن الشاشة.', 'after' => []],
                        ['type' => 'shared_checkpoint', 'role' => 'both', 'title' => 'حفظ حالة الجولة', 'expected' => 'لا تعود الجولة.', 'checkpoint' => 'بعد إعادة الدخول، هل اختفت الجولة لدى الطرفين؟', 'after' => [1, 2]],
                    ]),
                ]),
            ],
        ],
    ],
    'known_issues' => [
        [
            'key' => 'THR-AUD-143',
            'scenario' => 'THR-FIN-002',
            'title' => '[THR-AUD-143] لا يمكن حفظ معاملة مقسّمة على حساب بعملة ثلاثية المنازل (JOD/XPL)',
            'description' => "مشكلة معروفة غير محلولة، مسجلة من سجل تدقيق ثراء (10_MASTER_FINDINGS.md) بحالة Confirmed وفي REMEDIATION_QUEUE بحالة «Queued — not started».\nالتصنيف في ثراء: Financial integrity — High — P1 — المرحلة B (تقابل في TestPilot: خطورة «كبيرة» وأولوية «عاجلة»).\nالموقع: app/Livewire/Transactions/TransactionForm.php:537 (فحص الحفظ يبني Transaction دون account_id) وapp/Services/TransactionSplitService.php (decimals() يعود إلى منزلتين).\nموجودة على Demo (b7785e2) وعلى dev (de3cb7b). البديل في العرض: ثلاث معاملات عادية.",
            'reproduction_steps' => "1. ادخل بمستخدم عملته JOD.\n2. معاملة جديدة ← مصروف 100.000 على حساب JOD.\n3. علّم «تقسيم على عدة تصنيفات» ← «بالمبلغ»: 60.000 / 25.000 / 15.000.\n4. لاحظ «جاهزة للحفظ» ثم اضغط «حفظ المعاملة».",
            'expected_result' => 'تُحفظ المعاملة المقسّمة كما تُحفظ على حساب USD.',
            'actual_result' => 'تُرفض بالرسالة «كل جزء يجب أن يكون مبلغًا أكبر من صفر…» رغم أن المحرر يعرض «جاهزة للحفظ».',
            // Tharaa scale High/P1 maps to TestPilot major/urgent (Critical→critical, High→major, Medium→minor, Low→trivial).
            'severity' => 'major',
            'priority' => 'urgent',
            'build_version' => 'b7785e2',
        ],
    ],
];
