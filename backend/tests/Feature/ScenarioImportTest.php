<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class ScenarioImportTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, mixed> */
    private function scenario(string $title, array $overrides = []): array
    {
        return array_merge([
            'title' => $title, 'objective' => "التحقق من $title", 'priority' => 'high',
            'steps' => [
                ['title' => 'افتح الصفحة', 'type' => 'navigate', 'url' => 'https://staging.example.test/login', 'expected_result' => 'تظهر الصفحة'],
                ['title' => 'أدخل البيانات', 'type' => 'input', 'expected_result' => 'تُقبل البيانات', 'evidence_required' => true],
            ],
        ], $overrides);
    }

    /** @return array<string, mixed> */
    private function document(array $scenarios, array $extra = []): array
    {
        return array_merge(['schema_version' => 1, 'suite' => 'مجموعة الاستيراد', 'scenarios' => $scenarios], $extra);
    }

    private function project(?User $owner = null): array
    {
        $owner ??= User::factory()->platformOwner()->create();
        $this->actingAs($owner);

        return [$this->postJson('/api/projects', ['name' => 'مشروع الاستيراد'])->json('data.id'), $owner];
    }

    private function confirm(int $project, array $document, array $extra = []): TestResponse
    {
        return $this->postJson("/api/projects/$project/scenarios/import", ['document' => $document, 'idempotency_key' => (string) Str::uuid(), ...$extra]);
    }

    public function test_kit_provides_template_prompt_and_limits_that_the_importer_accepts(): void
    {
        [$p] = $this->project();
        $kit = $this->getJson("/api/projects/$p/scenarios/import/kit")->assertOk()->json('data');
        $this->assertSame(1, $kit['template']['schema_version']);
        $this->assertSame(1048576, $kit['limits']['max_bytes']);
        $this->assertStringContainsString('schema_version', $kit['prompt']);
        $this->assertStringContainsString('مشروع الاستيراد', $kit['prompt']);
        $this->assertStringContainsString('shared_checkpoint', $kit['prompt']);
        $preview = $this->postJson("/api/projects/$p/scenarios/import/preview", ['document' => $kit['template']])->assertOk()->json('data');
        $this->assertSame(['total' => 1, 'new' => 1, 'duplicate' => 0, 'invalid' => 0, 'steps' => 3], $preview['summary']);
    }

    public function test_preview_reports_located_arabic_errors_and_never_writes(): void
    {
        [$p] = $this->project();
        $broken = $this->scenario('سيناريو ناقص', ['steps' => [
            ['title' => 'خطوة سليمة', 'expected_result' => 'يعمل'],
            ['title' => 'خطوة بلا نتيجة'],
        ]]);
        $document = $this->document([$this->scenario('الأول'), $this->scenario('الثاني'), $broken, $this->scenario('رابع', ['objective' => null])]);
        $data = $this->postJson("/api/projects/$p/scenarios/import/preview", ['document' => $document])->assertOk()->json('data');
        $this->assertSame(2, $data['summary']['invalid']);
        $this->assertContains('السيناريو 3، الخطوة 2: النتيجة المتوقعة مطلوب.', $data['errors']);
        $this->assertContains('السيناريو 4: الهدف مطلوب.', $data['errors']);
        $this->assertSame('invalid', $data['scenarios'][2]['status']);
        $this->assertSame('new', $data['scenarios'][0]['status']);
        $this->assertDatabaseCount('test_cases', 0);
        $this->assertDatabaseCount('test_suites', 0);
        $this->assertDatabaseCount('scenario_imports', 0);

        $bad = $this->postJson("/api/projects/$p/scenarios/import/preview", ['document' => $this->document([$this->scenario('x', ['steps' => [['title' => 'خطوة', 'type' => 'fly', 'expected_result' => 'نتيجة', 'url' => 'ftp://x']]])])])->json('data.errors');
        $this->assertContains('السيناريو 1، الخطوة 1: قيمة نوع الخطوة غير مسموحة.', $bad);
        $this->assertContains('السيناريو 1، الخطوة 1: رابط رابط الصفحة غير صالح، ويجب أن يبدأ بـ http أو https.', $bad);

        $this->postJson("/api/projects/$p/scenarios/import/preview", ['document' => ['schema_version' => 2, 'scenarios' => []]])->assertUnprocessable()->assertJsonValidationErrors('document');
        $this->postJson("/api/projects/$p/scenarios/import/preview", ['document' => []])->assertUnprocessable();
        $many = $this->document(array_fill(0, 101, $this->scenario('نسخة')));
        $this->assertStringContainsString('يتجاوز الحد', json_encode($this->postJson("/api/projects/$p/scenarios/import/preview", ['document' => $many])->assertUnprocessable()->json('errors'), JSON_UNESCAPED_UNICODE));
    }

    public function test_duplicates_are_detected_in_the_project_and_inside_the_file(): void
    {
        [$p] = $this->project();
        $this->confirm($p, $this->document([$this->scenario('تسجيل الدخول')]))->assertCreated();
        $document = $this->document([$this->scenario('  تسجيل   الدخول '), $this->scenario('جديد'), $this->scenario('جديد'), $this->scenario('آخر')]);
        $data = $this->postJson("/api/projects/$p/scenarios/import/preview", ['document' => $document])->assertOk()->json('data');
        $this->assertSame(['duplicate', 'new', 'duplicate_in_file', 'new'], array_column($data['scenarios'], 'status'));
        $this->assertSame(['total' => 4, 'new' => 2, 'duplicate' => 2, 'invalid' => 0, 'steps' => 8], $data['summary']);
        $this->assertSame('تسجيل الدخول', $data['scenarios'][0]['duplicate_of']['title']);
        $this->assertSame('existing', $data['suite']['mode']);
    }

    public function test_confirm_saves_drafts_audits_and_is_idempotent(): void
    {
        [$p, $owner] = $this->project();
        $document = $this->document([$this->scenario('الأول'), $this->scenario('الثاني')]);
        $key = (string) Str::uuid();
        $created = $this->postJson("/api/projects/$p/scenarios/import", ['document' => $document, 'idempotency_key' => $key, 'expected' => ['new' => 2, 'duplicate' => 0]])
            ->assertCreated()->assertJsonCount(2, 'data.created')->assertJsonPath('data.replayed', false)->assertJsonPath('data.suite.name', 'مجموعة الاستيراد')->json('data');
        $this->assertDatabaseCount('test_cases', 2);
        $this->assertSame(['draft', 'draft'], DB::table('test_cases')->pluck('status')->all());
        $this->assertDatabaseCount('scenario_revisions', 2);
        $this->assertDatabaseHas('activity_logs', ['project_id' => $p, 'action' => 'scenarios.imported']);
        $scenario = $this->getJson("/api/projects/$p/scenarios/{$created['created'][0]['id']}")->assertOk()->json('data');
        $this->assertCount(2, $scenario['content']['steps']);
        $this->assertSame($scenario['content']['steps'][0]['id'], $scenario['content']['steps'][1]['depends_on'][0]);
        $this->assertTrue($scenario['content']['steps'][1]['evidence_required']);

        $replay = $this->postJson("/api/projects/$p/scenarios/import", ['document' => $document, 'idempotency_key' => $key])->assertOk()->assertJsonPath('data.replayed', true)->json('data');
        $this->assertSame($created['created'], $replay['created']);
        $this->assertDatabaseCount('test_cases', 2);
        $this->postJson("/api/projects/$p/scenarios/import", ['document' => $this->document([$this->scenario('مختلف')]), 'idempotency_key' => $key])->assertConflict();
        $this->assertDatabaseCount('test_cases', 2);

        $again = $this->confirm($p, $document)->assertCreated()->json('data');
        $this->assertCount(0, $again['created']);
        $this->assertCount(2, $again['skipped_duplicates']);
        $copies = $this->confirm($p, $document, ['duplicates' => 'create'])->assertCreated()->json('data');
        $this->assertCount(2, $copies['created']);
        $this->assertDatabaseCount('test_cases', 4);
        $this->assertSame($owner->id, DB::table('scenario_imports')->value('user_id'));
    }

    public function test_confirm_refuses_invalid_documents_changes_since_preview_and_archived_projects(): void
    {
        [$p, $owner] = $this->project();
        $this->confirm($p, $this->document([$this->scenario('صالح'), $this->scenario('معطوب', ['steps' => []])]))->assertUnprocessable()->assertJsonValidationErrors('document');
        $this->assertDatabaseCount('test_cases', 0);
        $this->assertDatabaseCount('test_suites', 0);

        $document = $this->document([$this->scenario('موجود لاحقًا'), $this->scenario('جديد')]);
        $this->confirm($p, $this->document([$this->scenario('موجود لاحقًا')]))->assertCreated();
        $changed = $this->confirm($p, $document, ['expected' => ['new' => 2, 'duplicate' => 0]])->assertConflict()->assertJsonPath('code', 'import_changed')->json();
        $this->assertSame(1, $changed['preview']['summary']['duplicate']);
        $this->assertDatabaseCount('test_cases', 1);
        $this->confirm($p, $document, ['expected' => ['new' => 2, 'duplicate' => 0], 'acknowledge_changes' => true])->assertCreated()->assertJsonCount(1, 'data.created');

        $this->actingAs($owner)->patchJson("/api/projects/$p", ['name' => 'مشروع الاستيراد', 'status' => 'archived', 'version' => 1])->assertOk();
        $this->confirm($p, $this->document([$this->scenario('بعد الأرشفة')]))->assertUnprocessable();
    }

    public function test_import_respects_roles_suites_and_project_isolation(): void
    {
        [$p, $owner] = $this->project();
        $viewer = User::factory()->create();
        $this->putJson("/api/projects/$p/members", ['email' => $viewer->email, 'role' => 'viewer'])->assertOk();
        $suite = $this->postJson("/api/projects/$p/suites", ['name' => 'موجودة', 'position' => 0, 'archived' => false])->json('data.id');
        $document = $this->document([$this->scenario('بسيط')]);

        $this->actingAs($viewer);
        $this->getJson("/api/projects/$p/scenarios/import/kit")->assertForbidden();
        $this->postJson("/api/projects/$p/scenarios/import/preview", ['document' => $document])->assertForbidden();
        $this->confirm($p, $document)->assertForbidden();

        [$other] = $this->project();
        $this->confirm($p, $document)->assertNotFound();
        $this->postJson("/api/projects/$other/scenarios/import/preview", ['document' => $document, 'suite_id' => $suite])->assertUnprocessable()->assertJsonValidationErrors('suite_id');
        $this->assertSame(0, DB::table('test_cases')->count());

        $this->actingAs($owner);
        $this->confirm($p, $document, ['suite_id' => $suite])->assertCreated()->assertJsonPath('data.suite.id', $suite);
        $this->assertSame(1, DB::table('test_suites')->count());
        $this->assertDatabaseHas('test_cases', ['suite_id' => $suite, 'project_id' => $p, 'status' => 'draft']);
    }
}
