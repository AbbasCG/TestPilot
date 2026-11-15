<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\CreatesCollaborativeRun;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    use CreatesCollaborativeRun, RefreshDatabase;

    public function test_dashboard_requires_authentication(): void
    {
        $this->getJson('/api/dashboard')->assertUnauthorized();
    }

    public function test_dashboard_filters_project_access_and_limits_critical_issues_in_priority_order(): void
    {
        [$project, $owner, $tester, $run] = $this->collaborativeRun();
        $viewer = User::factory()->create();
        $this->putJson("/api/projects/$project/members", ['email' => $viewer->email, 'role' => 'viewer'])->assertOk();
        $blocker = $this->postJson("/api/projects/$project/issues", IssueWorkflowTest::issuePayload(['severity' => 'blocker']))
            ->assertCreated()->json('data.id');
        for ($index = 1; $index <= 5; $index++) {
            $this->postJson("/api/projects/$project/issues", IssueWorkflowTest::issuePayload(['title' => "Critical issue $index"]))->assertCreated();
        }

        $this->actingAs($tester)->getJson('/api/dashboard')->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('data.projects', 1)
            ->assertJsonPath('data.open_runs', 1)
            ->assertJsonPath('data.my_runs.0.id', $run['id'])
            ->assertJsonPath('data.open_issues', 6)
            ->assertJsonPath('data.critical_open', 6)
            ->assertJsonCount(5, 'data.critical_issues')
            ->assertJsonPath('data.critical_issues.0.id', $blocker);

        $this->actingAs($viewer)->getJson('/api/dashboard')->assertOk()
            ->assertJsonPath('data.open_runs', 1)->assertJsonCount(0, 'data.my_runs')
            ->assertJsonPath('data.critical_open', 6);
        $this->actingAs(User::factory()->create())->getJson('/api/dashboard')->assertOk()
            ->assertJsonPath('data.open_runs', 0)->assertJsonPath('data.open_issues', 0)
            ->assertJsonCount(0, 'data.my_runs')->assertJsonCount(0, 'data.critical_issues');

        $this->actingAs($owner)->patchJson("/api/projects/$project", ['name' => 'Collaboration', 'status' => 'archived', 'version' => 1])->assertOk();
        $this->getJson('/api/dashboard')->assertOk()
            ->assertJsonPath('data.projects', 1)->assertJsonPath('data.active_projects', 0)
            ->assertJsonPath('data.open_runs', 0)->assertJsonPath('data.critical_open', 0)
            ->assertJsonCount(0, 'data.my_runs')->assertJsonCount(0, 'data.critical_issues');
    }

    public function test_dashboard_counts_only_sessions_completed_in_the_last_seven_days(): void
    {
        [, $owner, , $run] = $this->collaborativeRun();
        $this->freezeSecond();
        DB::table('test_runs')->where('id', $run['id'])->update([
            'status' => 'completed', 'outcome' => 'passed', 'completed_at' => now()->subDays(7), 'summary' => 'Completed session summary',
        ]);

        $this->actingAs($owner)->getJson('/api/dashboard')->assertOk()
            ->assertJsonPath('data.outcomes_last_7_days.passed', 1)
            ->assertJsonPath('data.outcomes_last_7_days.failed', 0)
            ->assertJsonCount(0, 'data.my_runs')
            ->assertJsonPath('data.open_runs', 0);

        $this->travel(1)->seconds();
        $this->getJson('/api/dashboard')->assertOk()->assertJsonPath('data.outcomes_last_7_days.passed', 0);
    }
}
