<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\CreatesCollaborativeRun;
use Tests\TestCase;

class MyWorkTest extends TestCase
{
    use CreatesCollaborativeRun, RefreshDatabase;

    /** @param array<string, mixed> $issue */
    private function move(int $project, array $issue, string $to, array $extra = []): array
    {
        return $this->postJson("/api/projects/$project/issues/{$issue['id']}/transition", ['to' => $to, 'version' => $issue['version'], ...$extra])
            ->assertOk()->json('data');
    }

    public function test_my_work_requires_authentication(): void
    {
        $this->getJson('/api/my-work')->assertUnauthorized();
    }

    public function test_my_work_lists_own_sessions_retests_and_assigned_issues_only(): void
    {
        [$project, $owner, $tester, $run] = $this->collaborativeRun();
        $create = fn (array $extra = []) => $this->actingAs($owner)->postJson("/api/projects/$project/issues", IssueWorkflowTest::issuePayload($extra))->assertCreated()->json('data');

        $forTester = $this->move($project, $this->move($project, $create(['title' => 'Assigned to B', 'severity' => 'minor']), 'triaged'), 'assigned', ['assignee_id' => $tester->id]);
        $blocker = $this->move($project, $this->move($project, $create(['title' => 'Blocker for B', 'severity' => 'blocker']), 'triaged'), 'assigned', ['assignee_id' => $tester->id]);
        $fixed = $this->move($project, $this->move($project, $this->move($project, $create(['title' => 'Fixed by A']), 'triaged'), 'assigned', ['assignee_id' => $owner->id]), 'in_progress');
        $this->move($project, $fixed, 'ready_for_retest', ['note' => 'أصلحنا الزر', 'build_version' => 'v1.1', 'retest_assignee_id' => $tester->id]);
        $create(['title' => 'Unassigned']);

        $participant = collect($run['participants'])->firstWhere('role', 'B')['id'];
        $steps = collect($run['results'])->where('participant_id', $participant);
        $this->assertGreaterThan(0, $steps->count());
        $this->actingAs($tester)->getJson('/api/my-work')->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('data.counts', ['runs' => 1, 'retests' => 1, 'issues' => 2])
            ->assertJsonPath('data.runs.0.id', $run['id'])
            ->assertJsonPath('data.runs.0.my_role', 'B')
            ->assertJsonPath('data.runs.0.project_name', 'Collaboration')
            ->assertJsonPath('data.runs.0.my_total', $steps->count())
            ->assertJsonPath('data.runs.0.my_pending', $steps->count())
            ->assertJsonPath('data.retests.0.issue_id', $fixed['id'])
            ->assertJsonPath('data.retests.0.build_version', 'v1.1')
            ->assertJsonPath('data.issues.0.id', $blocker['id'])
            ->assertJsonPath('data.issues.1.id', $forTester['id']);

        $this->actingAs($owner)->getJson('/api/my-work')->assertOk()
            ->assertJsonPath('data.counts', ['runs' => 1, 'retests' => 0, 'issues' => 1])
            ->assertJsonPath('data.runs.0.my_role', 'A')
            ->assertJsonPath('data.issues.0.id', $fixed['id']);

        $this->actingAs(User::factory()->create())->getJson('/api/my-work')->assertOk()
            ->assertJsonPath('data.counts', ['runs' => 0, 'retests' => 0, 'issues' => 0]);
    }

    public function test_my_work_drops_completed_sessions_closed_issues_and_archived_projects(): void
    {
        [$project, $owner, $tester, $run] = $this->collaborativeRun();
        $issue = $this->actingAs($owner)->postJson("/api/projects/$project/issues", IssueWorkflowTest::issuePayload())->assertCreated()->json('data');
        $this->move($project, $this->move($project, $issue, 'triaged'), 'assigned', ['assignee_id' => $tester->id]);

        $this->actingAs($tester)->getJson('/api/my-work')->assertJsonPath('data.counts', ['runs' => 1, 'retests' => 0, 'issues' => 1]);

        $this->actingAs($owner)->patchJson("/api/projects/$project", ['name' => 'Collaboration', 'status' => 'archived', 'version' => 1])->assertOk();
        $this->actingAs($tester)->getJson('/api/my-work')->assertOk()
            ->assertJsonPath('data.counts', ['runs' => 0, 'retests' => 0, 'issues' => 0])
            ->assertJsonCount(0, 'data.runs')->assertJsonCount(0, 'data.issues');
    }
}
