<?php

namespace App\Services\Scenarios;

use App\Models\Project;
use App\Models\TestCase;
use App\Models\TestSuite;
use App\Models\User;
use App\Services\ProjectService;
use App\Services\ScenarioService;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Generic scenario import for any project. The document is treated purely as
 * data: it is validated with the same rules as the scenario editor, previewed
 * without writing anything, and on confirmation saved as drafts inside one
 * transaction that is idempotent per (project, idempotency key).
 */
class ScenarioImportService
{
    public const SCHEMA_VERSION = 1;

    public const MAX_BYTES = 1_048_576;

    public const MAX_SCENARIOS = 100;

    public const MAX_TOTAL_STEPS = 2000;

    public const DEFAULT_SUITE = 'سيناريوهات مستوردة';

    private const DEFAULT_CRITERIA = 'تتطابق النتائج الفعلية لكل الخطوات مع النتائج المتوقعة دون أخطاء.';

    private const MESSAGES = [
        'required' => ':attribute مطلوب.',
        'present' => ':attribute مطلوب.',
        'string' => ':attribute يجب أن يكون نصًا.',
        'array' => ':attribute يجب أن يكون قائمة.',
        'boolean' => ':attribute يجب أن يكون true أو false.',
        'in' => 'قيمة :attribute غير مسموحة.',
        'url' => 'رابط :attribute غير صالح، ويجب أن يبدأ بـ http أو https.',
        'uuid' => 'معرّف :attribute غير صالح.',
        'distinct' => 'قيمة مكررة في :attribute.',
        'max.string' => ':attribute يتجاوز الحد المسموح (:max حرفًا).',
        'max.array' => ':attribute يتجاوز الحد المسموح (:max عنصرًا).',
        'min.array' => 'أضف :min عنصرًا على الأقل في :attribute.',
    ];

    private const ATTRIBUTES = [
        'title' => 'العنوان', 'objective' => 'الهدف', 'description' => 'الوصف', 'priority' => 'الأولوية', 'test_type' => 'نوع الاختبار',
        'prerequisites' => 'الشروط المسبقة', 'required_account' => 'الحساب المطلوب', 'required_role' => 'الدور المطلوب', 'test_data' => 'بيانات الاختبار',
        'expected_results' => 'النتائج المتوقعة', 'acceptance_criteria' => 'معايير القبول', 'steps' => 'الخطوات', 'status' => 'الحالة', 'steps.*' => 'الخطوة',
        'steps.*.title' => 'عنوان الخطوة', 'steps.*.type' => 'نوع الخطوة', 'steps.*.assigned_role' => 'الدور', 'steps.*.url' => 'رابط الصفحة',
        'steps.*.expected_result' => 'النتيجة المتوقعة', 'steps.*.instructions' => 'التعليمات', 'steps.*.target' => 'العنصر المستهدف',
        'steps.*.value' => 'القيمة', 'steps.*.checkpoint' => 'معيار التحقق', 'steps.*.evidence_required' => 'اشتراط الدليل',
    ];

    public function __construct(private ScenarioService $scenarios, private ProjectService $audit) {}

    /**
     * @return array<string, int|string>
     */
    public function limits(): array
    {
        return ['schema_version' => self::SCHEMA_VERSION, 'max_bytes' => self::MAX_BYTES, 'max_scenarios' => self::MAX_SCENARIOS, 'max_steps_per_scenario' => 100, 'max_total_steps' => self::MAX_TOTAL_STEPS];
    }

    /**
     * A small valid document that doubles as documentation of the format.
     *
     * @return array<string, mixed>
     */
    public function template(): array
    {
        return [
            'schema_version' => self::SCHEMA_VERSION,
            'suite' => 'الدخول والحسابات',
            'scenarios' => [[
                'title' => 'تسجيل الدخول ببيانات صحيحة',
                'objective' => 'التحقق من أن المستخدم المسجّل يصل إلى لوحة التحكم بعد الدخول.',
                'priority' => 'high',
                'test_type' => 'functional',
                'prerequisites' => 'حساب تجريبي مفعّل.',
                'test_data' => 'البريد: qa.user@example.test — كلمة المرور من مدير الاختبار.',
                'acceptance_criteria' => 'يصل المستخدم إلى لوحة التحكم دون رسائل خطأ.',
                'steps' => [
                    ['title' => 'افتح صفحة تسجيل الدخول', 'type' => 'navigate', 'role' => 'A', 'url' => 'https://staging.example.test/login', 'instructions' => 'افتح الرابط في نافذة جديدة.', 'expected_result' => 'تظهر صفحة الدخول بحقلَي البريد وكلمة المرور.'],
                    ['title' => 'أدخل بيانات الحساب واضغط «دخول»', 'type' => 'input', 'role' => 'A', 'target' => 'نموذج الدخول', 'value' => 'qa.user@example.test', 'instructions' => 'اكتب البريد وكلمة المرور ثم اضغط الزر.', 'expected_result' => 'تظهر لوحة التحكم باسم المستخدم.', 'evidence_required' => true],
                    ['title' => 'تحقق من ظهور اسم المستخدم', 'type' => 'verify', 'role' => 'A', 'expected_result' => 'يظهر اسم المستخدم في أعلى الصفحة.'],
                ],
            ]],
        ];
    }

    /** Ready-to-paste instruction for an AI assistant working inside the repository under test. */
    public function prompt(Project $project): string
    {
        $example = json_encode($this->template(), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $lists = fn (array $values) => implode(' | ', $values);

        return <<<PROMPT
أنت مهندس ضمان جودة. اقرأ مستودع المشروع الحالي (الشيفرة والواجهات والتوثيق) واكتب سيناريوهات اختبار يدوية لمشروع «{$project->name}» يستطيع مختبر بشري تنفيذها خطوة بخطوة داخل متصفح أو تطبيق.

أخرج ملف JSON صالحًا فقط، بلا شرح قبله أو بعده وبلا علامات Markdown، وفق العقد التالي (schema_version = 1):

- schema_version: الرقم 1.
- suite: اسم مجموعة السيناريوهات (اختياري).
- scenarios: قائمة سيناريوهات (حتى 100). لكل سيناريو:
  - title (مطلوب، حتى 200 حرف)، objective (مطلوب)، acceptance_criteria (يُنصح به)، description، prerequisites، test_data.
  - priority: {$lists(ScenarioRules::PRIORITIES)}
  - test_type: {$lists(ScenarioRules::TEST_TYPES)}
  - steps: قائمة خطوات (من 1 إلى 100) مرتبة كما تُنفَّذ. لكل خطوة:
    - title (مطلوب): إجراء واحد واضح.
    - expected_result (مطلوب): ما يجب أن يراه المختبر بعد الإجراء.
    - type: {$lists(ScenarioRules::STEP_TYPES)} (الافتراضي custom_action).
    - role: A أو B أو both (الافتراضي A). استخدم B وboth فقط للسيناريوهات التي تحتاج مختبرَين، وفي نقطة التحقق المشتركة shared_checkpoint يجب أن يكون role = both وأن تكتب checkpoint.
    - instructions، url (يبدأ بـ http أو https)، target، value، evidence_required (true أو false)، checkpoint.

القواعد:
1. اكتب بالعربية الواضحة، وأبقِ الروابط والرموز والمعرّفات كما هي.
2. لا تكتب كلمات مرور أو مفاتيح أو بيانات حقيقية؛ استخدم بيانات تجريبية وصِف مصدر الحساب.
3. لا تكرر عنوان سيناريو، ولا تخترع ميزات غير موجودة في المستودع.
4. تُستورد السيناريوهات كمسودات يراجعها فريق الجودة قبل اعتمادها.

مثال لسيناريو صالح:

{$example}
PROMPT;
    }

    /**
     * Document-level problems that prevent any analysis.
     *
     * @return list<string>
     */
    public function documentErrors(mixed $document): array
    {
        if (! is_array($document) || array_is_list($document) && $document !== []) {
            return ['الملف يجب أن يحتوي كائن JSON يضم schema_version وقائمة scenarios.'];
        }
        $errors = [];
        if (($document['schema_version'] ?? null) !== self::SCHEMA_VERSION) {
            $errors[] = 'schema_version غير مدعوم أو مفقود. القيمة المطلوبة هي '.self::SCHEMA_VERSION.'.';
        }
        $scenarios = $document['scenarios'] ?? null;
        if (! is_array($scenarios) || $scenarios === [] || ! array_is_list($scenarios)) {
            $errors[] = 'قائمة scenarios مطلوبة وتحتوي سيناريو واحدًا على الأقل.';
        } else {
            if (count($scenarios) > self::MAX_SCENARIOS) {
                $errors[] = 'عدد السيناريوهات يتجاوز الحد المسموح ('.self::MAX_SCENARIOS.').';
            }
            $steps = 0;
            foreach ($scenarios as $scenario) {
                $steps += is_array($scenario) && is_array($scenario['steps'] ?? null) ? count($scenario['steps']) : 0;
            }
            if ($steps > self::MAX_TOTAL_STEPS) {
                $errors[] = 'إجمالي الخطوات يتجاوز الحد المسموح ('.self::MAX_TOTAL_STEPS.').';
            }
        }
        if (isset($document['suite']) && (! is_string($document['suite']) || mb_strlen($document['suite']) > 160)) {
            $errors[] = 'اسم المجموعة suite يجب أن يكون نصًا لا يتجاوز 160 حرفًا.';
        }

        return $errors;
    }

    /**
     * Read-only analysis of the document against the project's current data.
     *
     * @param  array<string, mixed>  $document
     * @return array<string, mixed>
     */
    public function preview(Project $project, array $document, ?int $suiteId = null, ?string $suiteName = null): array
    {
        return $this->analyze($project, $document, $suiteId, $suiteName)['preview'];
    }

    /**
     * @param  array<string, mixed>  $document
     * @return array{preview: array<string, mixed>, importable: array<int, array<string, mixed>>, suite: array<string, mixed>}
     */
    private function analyze(Project $project, array $document, ?int $suiteId, ?string $suiteName): array
    {
        $suite = $this->resolveSuite($project, $document, $suiteId, $suiteName);
        $existing = [];
        foreach (TestCase::where('project_id', $project->id)->get(['id', 'title']) as $case) {
            $existing[$this->key($case->title)] ??= ['id' => $case->id, 'title' => $case->title];
        }
        $seen = [];
        $rows = [];
        $importable = [];
        $allErrors = [];
        $summary = ['total' => 0, 'new' => 0, 'duplicate' => 0, 'invalid' => 0, 'steps' => 0];
        foreach ($document['scenarios'] as $position => $raw) {
            $number = $position + 1;
            $summary['total']++;
            $errors = [];
            $content = null;
            if (! is_array($raw) || array_is_list($raw) && $raw !== []) {
                $errors[] = "السيناريو $number: يجب أن يكون كائنًا يحتوي العنوان والخطوات.";
            } else {
                $content = $this->normalize($raw);
                $errors = $this->validateScenario($project, $content, $number);
            }
            $title = is_array($raw) && is_string($raw['title'] ?? null) && trim($raw['title']) !== '' ? trim($raw['title']) : '(بدون عنوان)';
            $stepCount = is_array($raw) && is_array($raw['steps'] ?? null) ? count($raw['steps']) : 0;
            $status = 'new';
            $duplicateOf = null;
            if ($errors !== []) {
                $status = 'invalid';
            } else {
                $key = $this->key($title);
                if (isset($existing[$key])) {
                    $status = 'duplicate';
                    $duplicateOf = $existing[$key];
                } elseif (isset($seen[$key])) {
                    $status = 'duplicate_in_file';
                    $duplicateOf = ['id' => null, 'title' => $seen[$key]];
                }
                $seen[$key] ??= $title;
                $importable[$position] = ['status' => $status, 'content' => $content, 'title' => $title];
            }
            $summary[match ($status) {
                'invalid' => 'invalid', 'new' => 'new', default => 'duplicate'
            }]++;
            if ($status !== 'invalid') {
                $summary['steps'] += $stepCount;
            }
            $allErrors = [...$allErrors, ...$errors];
            $rows[] = ['index' => $number, 'title' => $title, 'status' => $status, 'steps_count' => $stepCount, 'duplicate_of' => $duplicateOf, 'errors' => $errors];
        }

        return ['preview' => ['schema_version' => self::SCHEMA_VERSION, 'suite' => $suite, 'summary' => $summary, 'scenarios' => $rows, 'errors' => $allErrors], 'importable' => $importable, 'suite' => $suite];
    }

    /**
     * @param  array<string, mixed>  $document
     * @return array<string, mixed>
     */
    private function resolveSuite(Project $project, array $document, ?int $suiteId, ?string $suiteName): array
    {
        if ($suiteId) {
            $suite = TestSuite::where('project_id', $project->id)->where('archived', false)->find($suiteId);
            if (! $suite) {
                throw ValidationException::withMessages(['suite_id' => 'اختر مجموعة نشطة من هذا المشروع.']);
            }

            return ['mode' => 'existing', 'id' => $suite->id, 'name' => $suite->name];
        }
        $name = trim((string) ($suiteName ?: ($document['suite'] ?? ''))) ?: self::DEFAULT_SUITE;
        $found = TestSuite::where('project_id', $project->id)->where('archived', false)->whereRaw('lower(name) = ?', [mb_strtolower($name)])->first();

        return $found ? ['mode' => 'existing', 'id' => $found->id, 'name' => $found->name] : ['mode' => 'create', 'id' => null, 'name' => mb_substr($name, 0, 160)];
    }

    /**
     * Maps the import format to the scenario content stored by the editor.
     *
     * @param  array<string, mixed>  $raw
     * @return array<string, mixed>
     */
    private function normalize(array $raw): array
    {
        $text = fn ($value) => is_string($value) ? trim($value) : $value;
        $steps = [];
        $previous = null;
        foreach (is_array($raw['steps'] ?? null) ? $raw['steps'] : [] as $step) {
            if (! is_array($step)) {
                $steps[] = $step;

                continue;
            }
            $id = (string) Str::uuid();
            $role = $step['role'] ?? $step['assigned_role'] ?? 'A';
            $steps[] = [
                'id' => $id, 'type' => $step['type'] ?? 'custom_action', 'title' => $text($step['title'] ?? null), 'assigned_role' => $role,
                'url' => ($step['url'] ?? '') === '' ? null : $text($step['url'] ?? null), 'target' => $text($step['target'] ?? ''), 'value' => $text($step['value'] ?? ''),
                'expected_result' => $text($step['expected_result'] ?? null), 'instructions' => $text($step['instructions'] ?? ''),
                'checkpoint' => $text($step['checkpoint'] ?? ''), 'evidence_required' => $step['evidence_required'] ?? false,
                'depends_on' => $previous ? [$previous] : [],
            ];
            $previous = $id;
        }
        $criteria = $text($raw['acceptance_criteria'] ?? null);

        return [
            'suite_id' => 0, 'environment_id' => null, 'title' => $text($raw['title'] ?? null), 'description' => $text($raw['description'] ?? ''),
            'objective' => $text($raw['objective'] ?? null), 'priority' => $raw['priority'] ?? 'medium', 'test_type' => $raw['test_type'] ?? 'functional',
            'prerequisites' => $text($raw['prerequisites'] ?? ''), 'required_account' => $text($raw['required_account'] ?? ''), 'required_role' => $text($raw['required_role'] ?? ''),
            'test_data' => $text($raw['test_data'] ?? ''), 'expected_results' => $text($raw['expected_results'] ?? ''),
            'acceptance_criteria' => $criteria === null || $criteria === '' ? self::DEFAULT_CRITERIA : $criteria,
            'dependencies' => [], 'status' => 'draft', 'is_template' => false, 'steps' => $steps,
        ];
    }

    /**
     * @param  array<string, mixed>  $content
     * @return list<string>
     */
    private function validateScenario(Project $project, array $content, int $number): array
    {
        $rules = Arr::except(ScenarioRules::rules($project->id), ['suite_id', 'environment_id', 'dependencies.*', 'version']);
        $validator = Validator::make($content, $rules, self::MESSAGES, self::ATTRIBUTES);
        foreach (ScenarioRules::graphErrors($content['steps'] ?? []) as $key => $message) {
            $validator->after(fn ($v) => $v->errors()->add($key, $message));
        }
        $errors = [];
        foreach ($validator->errors()->messages() as $key => $messages) {
            $step = preg_match('/^steps\.(\d+)(?:\.|$)/', $key, $m) ? ((int) $m[1]) + 1 : null;
            foreach (array_unique($messages) as $message) {
                $errors[] = $step ? "السيناريو {$number}، الخطوة {$step}: {$message}" : "السيناريو {$number}: {$message}";
            }
        }

        return $errors;
    }

    private function key(string $title): string
    {
        return mb_strtolower((string) preg_replace('/\s+/u', ' ', trim($title)));
    }

    /**
     * @param  array<string, mixed>  $document
     * @param  array{suite_id?: int|null, suite_name?: string|null, idempotency_key: string, duplicates: string, expected?: array<string, int>|null, acknowledge_changes?: bool}  $options
     * @return array<string, mixed>
     */
    public function confirm(Project $project, User $actor, array $document, array $options): array
    {
        $hash = hash('sha256', json_encode([$document, $options['suite_id'] ?? null, $options['suite_name'] ?? null, $options['duplicates']], JSON_THROW_ON_ERROR));

        return DB::transaction(function () use ($project, $actor, $document, $options, $hash) {
            $locked = Project::whereKey($project->id)->lockForUpdate()->firstOrFail();
            Gate::forUser($actor)->authorize('designTests', $locked);
            abort_if($locked->status === 'archived', 422, 'أعد تفعيل المشروع قبل استيراد السيناريوهات.');

            $ledger = DB::table('scenario_imports')->where('project_id', $locked->id)->where('idempotency_key', $options['idempotency_key'])->first();
            if ($ledger) {
                abort_unless($ledger->payload_hash === $hash, 409, 'استُخدم مفتاح الاستيراد هذا لملف مختلف. أعد المعاينة ثم أكّد.');

                return [...json_decode($ledger->result, true, flags: JSON_THROW_ON_ERROR), 'replayed' => true];
            }

            $analysis = $this->analyze($locked, $document, $options['suite_id'] ?? null, $options['suite_name'] ?? null);
            $preview = $analysis['preview'];
            if ($preview['summary']['invalid'] > 0) {
                throw ValidationException::withMessages(['document' => $preview['errors']]);
            }
            $expected = $options['expected'] ?? null;
            if ($expected && empty($options['acknowledge_changes']) && ((int) $expected['new'] !== $preview['summary']['new'] || (int) $expected['duplicate'] !== $preview['summary']['duplicate'])) {
                throw new HttpResponseException(response()->json(['message' => 'تغيّرت بيانات المشروع منذ المعاينة. راجع الملخص المحدّث ثم أكّد الاستيراد.', 'code' => 'import_changed', 'preview' => $preview], 409));
            }

            $suite = $analysis['suite'];
            if ($suite['mode'] === 'create') {
                $model = new TestSuite(['name' => $suite['name'], 'description' => 'أُنشئت أثناء استيراد السيناريوهات.', 'position' => (int) TestSuite::where('project_id', $locked->id)->max('position') + 1, 'archived' => false]);
                $model->project_id = $locked->id;
                $model->version = 1;
                $model->save();
                $suite = ['mode' => 'existing', 'id' => $model->id, 'name' => $model->name];
            }
            $created = [];
            $skipped = [];
            foreach ($analysis['importable'] as $item) {
                if ($item['status'] !== 'new' && $options['duplicates'] === 'skip') {
                    $skipped[] = ['title' => $item['title']];

                    continue;
                }
                $saved = $this->scenarios->save($locked, $actor, [...$item['content'], 'suite_id' => $suite['id']]);
                $created[] = ['id' => $saved->id, 'title' => $saved->title];
            }
            $result = ['created' => $created, 'skipped_duplicates' => $skipped, 'suite' => $suite, 'replayed' => false];
            DB::table('scenario_imports')->insert(['project_id' => $locked->id, 'user_id' => $actor->id, 'idempotency_key' => $options['idempotency_key'], 'payload_hash' => $hash, 'result' => json_encode($result, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), 'created_at' => now()]);
            $this->audit->audit($locked, $actor, 'scenarios.imported', ['created' => count($created), 'skipped_duplicates' => count($skipped), 'suite_id' => $suite['id'], 'schema_version' => self::SCHEMA_VERSION]);

            return $result;
        });
    }
}
