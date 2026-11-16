<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Concerns\CreatesCollaborativeRun;
use Tests\TestCase;

class SoloRunAndSearchTest extends TestCase
{
    use CreatesCollaborativeRun, RefreshDatabase;

    /** @return array<string, mixed> */
    private function payload(int $suite, string $title, string $status = 'ready', string $priority = 'high'): array
    {
        return [
            'title' => $title, 'objective' => 'هدف '.$title, 'status' => $status, 'priority' => $priority, 'suite_id' => $suite,
            'test_type' => 'functional', 'is_template' => false, 'dependencies' => [], 'acceptance_criteria' => 'يعمل كما هو متوقع',
            'steps' => [['id' => (string) Str::uuid(), 'title' => 'افتح الصفحة', 'type' => 'navigate', 'assigned_role' => 'A', 'evidence_required' => false, 'depends_on' => [], 'expected_result' => 'تظهر الصفحة']],
        ];
    }

    /** @return array{0:int,1:User,2:int,3:int,4:int} */
    private function projectWithSoloScenario(): array
    {
        $owner = User::factory()->platformOwner()->create();
        $this->actingAs($owner);
        $p = $this->postJson('/api/projects', ['name' => 'مشروع منفرد'])->json('data.id');
        $env = $this->postJson("/api/projects/$p/environments", ['name' => 'Stage'])->json('data.id');
        $suite = $this->postJson("/api/projects/$p/suites", ['name' => 'مجموعة', 'position' => 0, 'archived' => false])->json('data.id');
        $scenario = $this->postJson("/api/projects/$p/scenarios", $this->payload($suite, 'تسجيل الدخول بنجاح'))->assertCreated()->json('data.id');

        return [$p, $owner, $env, $scenario, $suite];
    }

    public function test_solo_run_has_one_participant_and_old_runs_stay_collaborative(): void
    {
        [$p, $owner, $env, $scenario] = $this->projectWithSoloScenario();
        $run = $this->postJson("/api/projects/$p/runs", ['mode' => 'solo', 'title' => 'اختبار منفرد', 'build_version' => 'v1', 'environment_id' => $env, 'tester_a_id' => $owner->id, 'scenarios' => [['id' => $scenario, 'version' => 1]]])
            ->assertCreated()->assertJsonPath('data.mode', 'solo')->json('data');
        $this->assertSame('solo', DB::table('test_runs')->where('id', $run['id'])->value('mode'));
        $this->assertSame(1, DB::table('run_participants')->where('test_run_id', $run['id'])->count());
        $this->getJson("/api/projects/$p/runs/{$run['id']}")->assertOk()->assertJsonPath('data.mode', 'solo');

        [$p2, , , $collab] = $this->collaborativeRun();
        $this->getJson("/api/projects/$p2/runs/{$collab['id']}")->assertOk()->assertJsonPath('data.mode', 'collaborative');
    }

    public function test_solo_run_is_refused_for_multi_role_scenarios_and_options_flag_them(): void
    {
        [$p, $owner, $env, , $suite] = $this->projectWithSoloScenario();
        $multi = $this->postJson("/api/projects/$p/scenarios", array_merge(config('scenario_templates')[9]['content'], ['status' => 'ready', 'suite_id' => $suite]))->assertCreated()->json('data.id');
        $options = collect($this->getJson("/api/projects/$p/scenario-options")->assertOk()->json('data'))->keyBy('id');
        $this->assertTrue($options[$multi]['solo_eligible'] === false && $options[$multi]['solo_reason'] !== null);
        $this->postJson("/api/projects/$p/runs", ['mode' => 'solo', 'title' => 'مرفوض', 'build_version' => 'v1', 'environment_id' => $env, 'tester_a_id' => $owner->id, 'scenarios' => [['id' => $multi, 'version' => 1]]])
            ->assertUnprocessable();
        $this->assertSame(0, DB::table('test_runs')->count());
    }

    public function test_search_finds_scenarios_and_issues_by_title_or_id_within_the_project_only(): void
    {
        [$p, $owner, , $scenario] = $this->projectWithSoloScenario();
        $this->postJson("/api/projects/$p/issues", IssueWorkflowTest::issuePayload(['title' => 'خلل في تسجيل الدخول']))->assertCreated();
        $found = $this->getJson("/api/projects/$p/search?q=".urlencode('تسجيل'))->assertOk()->json('data');
        $this->assertNotEmpty($found['scenarios']);
        $this->assertNotEmpty($found['issues']);
        $this->assertSame($scenario, $this->getJson("/api/projects/$p/search?q=TC-$scenario")->json('data.scenarios.0.id'));

        $outsider = User::factory()->create();
        $this->actingAs($outsider)->getJson("/api/projects/$p/search?q=تسجيل")->assertNotFound();
        $this->actingAs($owner);
        [$other] = [$this->postJson('/api/projects', ['name' => 'آخر'])->json('data.id')];
        $this->assertEmpty($this->getJson("/api/projects/$other/search?q=".urlencode('تسجيل'))->json('data.scenarios'));
    }

    public function test_scenario_list_filters_and_project_stats(): void
    {
        [$p, , , , $suite] = $this->projectWithSoloScenario();
        $this->postJson("/api/projects/$p/scenarios", $this->payload($suite, 'مسودة الدفع', 'draft', 'low'))->assertCreated();
        $this->assertCount(1, $this->getJson("/api/projects/$p/scenarios?status=draft")->json('data'));
        $this->assertCount(1, $this->getJson("/api/projects/$p/scenarios?priority=high")->json('data'));
        $this->assertCount(1, $this->getJson("/api/projects/$p/scenarios?search=".urlencode('الدفع'))->json('data'));
        $this->getJson("/api/projects/$p/scenarios?status=bogus")->assertUnprocessable();
        $this->assertNotNull($this->getJson("/api/projects/$p")->json('data.stats'));
        $this->assertCount(1, $this->getJson('/api/projects?search='.urlencode('منفرد'))->json('data'));
        $this->assertCount(0, $this->getJson('/api/projects?search=zzzz')->json('data'));
    }
}
