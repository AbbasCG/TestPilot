<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CollaborativeRunTest extends TestCase
{
    use RefreshDatabase;

    public function fixture(): array
    {
        $a = User::factory()->create();
        $b = User::factory()->create();
        $this->actingAs($a);
        $p = $this->postJson('/api/projects', ['name' => 'Collaboration'])->json('data.id');
        $this->putJson("/api/projects/$p/members", ['email' => $b->email, 'role' => 'tester'])->assertOk();
        $suite = $this->postJson("/api/projects/$p/suites", ['name' => 'Invitations', 'position' => 0, 'archived' => false])->json('data.id');
        $environment = $this->postJson("/api/projects/$p/environments", ['name' => 'Stage'])->json('data.id');
        $content = array_merge(config('scenario_templates')[9]['content'], ['suite_id' => $suite, 'status' => 'ready']);
        $scenario = $this->postJson("/api/projects/$p/scenarios", $content)->assertCreated()->json('data');
        $input = ['title' => 'Two-person run', 'build_version' => 'v1.0', 'environment_id' => $environment, 'suite_id' => $suite, 'tester_a_id' => $a->id, 'tester_b_id' => $b->id, 'scenarios' => [['id' => $scenario['id'], 'version' => 1]]];
        $run = $this->postJson("/api/projects/$p/runs", $input)->assertCreated()->json('data');

        return [$p, $a, $b, $run, $scenario, $input];
    }

    public static function resultPayload(int $version = 0, string $status = 'passed'): array
    {
        return ['version' => $version, 'status' => $status, 'actual_result' => 'تحققت النتيجة المتوقعة عمليًا في البيئة المحددة', 'notes' => 'فحص مستقل', 'verified' => true];
    }

    public function test_two_users_have_independent_results_and_explicit_final_assessment(): void
    {
        [$p, $a, $b, $run] = $this->fixture();
        $id = $run['id'];
        $this->assertCount(5, $run['results']);
        $this->postJson("/api/projects/$p/runs/$id/transition", ['action' => 'complete', 'version' => 1, 'outcome' => 'passed', 'summary' => 'Premature assessment'])->assertUnprocessable();
        $first = $run['results'][0];
        $this->actingAs($b)->putJson("/api/projects/$p/runs/$id/results/{$first['id']}", self::resultPayload())->assertForbidden();
        $last = end($run['results']);
        $this->putJson("/api/projects/$p/runs/$id/results/{$last['id']}", self::resultPayload())->assertConflict();
        $users = [$run['participants'][0]['id'] => $a, $run['participants'][1]['id'] => $b];
        foreach ($run['results'] as $result) {
            $this->actingAs($users[$result['participant_id']])->putJson("/api/projects/$p/runs/$id/results/{$result['id']}", self::resultPayload())->assertOk();
        }
        $current = $this->getJson("/api/projects/$p/runs/$id")->assertOk()->assertJsonPath('data.status', 'active')->assertJsonPath('data.outcome', null)->json('data');
        $this->actingAs($a)->postJson("/api/projects/$p/runs/$id/transition", ['action' => 'complete', 'version' => $current['version'], 'outcome' => 'passed', 'summary' => 'Both testers independently verified every expected result.'])->assertOk()->assertJsonPath('data.outcome', 'passed');
        $this->assertDatabaseCount('result_history', 5);
        $this->assertDatabaseHas('test_runs', ['id' => $id, 'status' => 'completed', 'outcome' => 'passed']);
    }

    public function test_pause_resume_conflicts_and_history_survive_scenario_edits(): void
    {
        [$p, $a, , $run, $scenario] = $this->fixture();
        $id = $run['id'];
        $first = $run['results'][0]['id'];
        $this->postJson("/api/projects/$p/runs/$id/transition", ['action' => 'pause', 'version' => 1])->assertOk()->assertJsonPath('data.status', 'paused');
        $this->putJson("/api/projects/$p/runs/$id/results/$first", self::resultPayload())->assertConflict();
        $this->postJson("/api/projects/$p/runs/$id/transition", ['action' => 'resume', 'version' => 1])->assertConflict();
        $this->postJson("/api/projects/$p/runs/$id/transition", ['action' => 'resume', 'version' => 2])->assertOk();
        $this->putJson("/api/projects/$p/runs/$id/results/$first", self::resultPayload())->assertOk();
        $this->putJson("/api/projects/$p/runs/$id/results/$first", self::resultPayload())->assertConflict();
        $updated = array_merge($scenario['content'], ['title' => 'New scenario title', 'version' => 1]);
        $this->putJson("/api/projects/$p/scenarios/{$scenario['id']}", $updated)->assertOk();
        $this->getJson("/api/projects/$p/runs/$id")->assertJsonPath('data.cases.0.snapshot.title', 'سير عمل بين شخصين')->assertJsonPath('data.cases.0.snapshot.version', 1)->assertJsonPath('data.results.0.status', 'passed');
        $this->getJson("/api/projects/$p/runs/$id/history")->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.actor_id', $a->id);
    }

    public function test_run_and_result_project_isolation_and_unverified_pass_rejection(): void
    {
        [$p, , $b, $run] = $this->fixture();
        $id = $run['id'];
        $result = $run['results'][0]['id'];
        $this->putJson("/api/projects/$p/runs/$id/results/$result", array_merge(self::resultPayload(), ['verified' => false]))->assertUnprocessable();
        $this->actingAs(User::factory()->create());
        $other = $this->postJson('/api/projects', ['name' => 'Other'])->json('data.id');
        $this->getJson("/api/projects/$p/runs/$id")->assertNotFound();
        $this->getJson("/api/projects/$other/runs/$id")->assertNotFound();
        $this->putJson("/api/projects/$other/runs/$id/results/$result", self::resultPayload())->assertNotFound();
        $this->assertDatabaseCount('result_history', 0);
    }

    public function test_creation_rejects_same_user_stale_versions_and_foreign_environment(): void
    {
        [$p, $a, , , $scenario, $input] = $this->fixture();
        $this->postJson("/api/projects/$p/runs", array_merge($input, ['tester_b_id' => $a->id]))->assertUnprocessable();
        $input['scenarios'][0]['version'] = 99;
        $this->postJson("/api/projects/$p/runs", $input)->assertConflict();
        $input['scenarios'][0]['version'] = 1;
        $input['environment_id'] = 999999;
        $this->postJson("/api/projects/$p/runs", $input)->assertUnprocessable();
        $this->assertDatabaseCount('test_runs', 1);
    }

    public function test_active_participants_cannot_be_removed_and_dependent_passes_lock_prior_results(): void
    {
        [$p, , $b, $run] = $this->fixture();
        $this->deleteJson("/api/projects/$p/members/{$b->id}")->assertUnprocessable();
        $this->putJson("/api/projects/$p/members", ['email' => $b->email, 'role' => 'viewer'])->assertUnprocessable();
        $id = $run['id'];
        $first = $run['results'][0]['id'];
        $second = $run['results'][1]['id'];
        $this->putJson("/api/projects/$p/runs/$id/results/$first", self::resultPayload())->assertOk();
        $this->putJson("/api/projects/$p/runs/$id/results/$second", self::resultPayload())->assertOk();
        $this->putJson("/api/projects/$p/runs/$id/results/$first", self::resultPayload(1, 'failed'))->assertConflict();
        $this->assertDatabaseHas('step_results', ['id' => $first, 'status' => 'passed', 'version' => 1]);
    }
}
