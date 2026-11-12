<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\CreatesCollaborativeRun;
use Tests\TestCase;

class IssueWorkflowTest extends TestCase
{
    use CreatesCollaborativeRun, RefreshDatabase;

    /**
     * Owner A and tester B run a two-person scenario; A records a failed result.
     *
     * @return array{0: int, 1: User, 2: User, 3: array<string, mixed>, 4: int}
     */
    private function failedRun(): array
    {
        [$p, $a, $b, $run] = $this->collaborativeRun();
        $first = $run['results'][0]['id'];
        $this->actingAs($a)->putJson("/api/projects/$p/runs/{$run['id']}/results/$first", CollaborativeRunTest::resultPayload(0, 'failed'))->assertOk();

        return [$p, $a, $b, $run, $first];
    }

    public static function issuePayload(array $extra = []): array
    {
        return array_merge([
            'title' => 'زر قبول الدعوة لا يستجيب', 'description' => 'عند الضغط على زر القبول لا يحدث شيء.',
            'reproduction_steps' => "1. افتح الدعوة\n2. اضغط قبول", 'expected_result' => 'تُقبل الدعوة',
            'actual_result' => 'لا يحدث شيء', 'severity' => 'critical', 'priority' => 'high',
        ], $extra);
    }

    private function move(int $p, array $issue, string $to, array $extra = []): TestResponse
    {
        return $this->postJson("/api/projects/$p/issues/{$issue['id']}/transition", array_merge(['to' => $to, 'version' => $issue['version']], $extra));
    }

    public function test_full_issue_lifecycle_with_failed_and_passed_retests_preserves_history(): void
    {
        [$p, $a, $b, $run, $failed] = $this->failedRun();

        $issue = $this->actingAs($b)->postJson("/api/projects/$p/issues", self::issuePayload(['step_result_id' => $failed]))->assertCreated()
            ->assertJsonPath('data.number', 1)->assertJsonPath('data.test_run_id', $run['id'])->assertJsonPath('data.status', 'new')
            ->assertJsonPath('data.build_version', 'v1.0')->assertJsonPath('data.step.tester_role', 'A')->json('data');
        $this->postJson("/api/projects/$p/issues", self::issuePayload(['step_result_id' => $failed]))->assertConflict();
        $this->postJson("/api/projects/$p/issues", self::issuePayload(['step_result_id' => $run['results'][1]['id']]))->assertUnprocessable();
        $this->assertSame([], $issue['permissions']['transitions']);
        $this->move($p, $issue, 'triaged')->assertForbidden();

        $issue = $this->actingAs($a)->move($p, $issue, 'triaged')->assertOk()->json('data');
        $this->move($p, $issue, 'verified')->assertUnprocessable();
        $this->move($p, $issue, 'assigned')->assertUnprocessable();
        $issue = $this->move($p, $issue, 'assigned', ['assignee_id' => $a->id])->assertOk()->assertJsonPath('data.assignee_id', $a->id)->json('data');
        $this->move($p, ['id' => $issue['id'], 'version' => 1], 'in_progress')->assertConflict();
        $issue = $this->move($p, $issue, 'in_progress')->assertOk()->json('data');
        $this->move($p, $issue, 'ready_for_retest', ['note' => 'أصلحنا معالج الزر', 'build_version' => 'v1.1', 'retest_assignee_id' => $a->id])->assertUnprocessable();
        $issue = $this->move($p, $issue, 'ready_for_retest', ['note' => 'أصلحنا معالج الزر', 'build_version' => 'v1.1', 'retest_assignee_id' => $b->id])->assertOk()
            ->assertJsonPath('data.status', 'ready_for_retest')->assertJsonPath('data.retests.0.status', 'pending')->assertJsonPath('data.retests.0.snapshot.step.title', $issue['step']['title'])->json('data');
        $this->move($p, $issue, 'verified')->assertUnprocessable();
        $retest = $issue['retests'][0];
        $outcome = ['version' => $retest['version'], 'status' => 'failed', 'actual_result' => 'ما زال الزر لا يستجيب', 'verified' => true];
        $this->putJson("/api/projects/$p/retests/{$retest['id']}", $outcome)->assertForbidden();

        $issue = $this->actingAs($b)->putJson("/api/projects/$p/retests/{$retest['id']}", $outcome)->assertOk()->assertJsonPath('data.status', 'reopened')->json('data');
        $this->putJson("/api/projects/$p/retests/{$retest['id']}", ['version' => 2] + $outcome)->assertConflict();

        $issue = $this->actingAs($a)->move($p, $issue, 'in_progress')->assertOk()->json('data');
        $issue = $this->move($p, $issue, 'ready_for_retest', ['note' => 'إصلاح ثانٍ', 'build_version' => 'v1.2', 'retest_assignee_id' => $b->id])->assertOk()->json('data');
        $second = $issue['retests'][1];
        $this->assertSame(2, $second['attempt_number']);
        $pass = ['version' => $second['version'], 'status' => 'passed', 'actual_result' => 'تقبل الدعوة الآن', 'verified' => false];
        $this->actingAs($b)->putJson("/api/projects/$p/retests/{$second['id']}", $pass)->assertUnprocessable();
        $issue = $this->putJson("/api/projects/$p/retests/{$second['id']}", ['verified' => true] + $pass)->assertOk()->assertJsonPath('data.status', 'verified')->json('data');
        $this->postJson("/api/projects/$p/issues/{$issue['id']}/comments", ['body' => 'تم التحقق على v1.2'])->assertCreated();
        $this->move($p, $issue, 'closed')->assertForbidden();
        $issue = $this->actingAs($a)->getJson("/api/projects/$p/issues/{$issue['id']}")->json('data');
        $closed = $this->move($p, $issue, 'closed')->assertOk()->assertJsonPath('data.status', 'closed')->json('data');

        $this->assertSame(['failed', 'passed'], array_column($closed['retests'], 'status'));
        $this->assertCount(1, $closed['comments']);
        $events = array_column($closed['activities'], 'event');
        $this->assertSame(['created', 'status_changed', 'status_changed', 'status_changed', 'retest_requested', 'status_changed', 'retest_recorded', 'status_changed'], array_slice($events, 0, 8));
        $this->assertContains('commented', $events);
        $this->assertDatabaseHas('step_results', ['id' => $failed, 'status' => 'failed']);
        $this->assertDatabaseHas('activity_logs', ['project_id' => $p, 'action' => 'retest.recorded']);
        $this->getJson("/api/projects/$p/issues?status=open")->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/projects/$p/issues?search=%23".$closed['number'])->assertOk()->assertJsonCount(1, 'data');
        $this->getJson("/api/projects/$p/issues-summary")->assertOk()->assertJsonPath('data.total', 1)->assertJsonPath('data.retests.passed', 1)->assertJsonPath('data.retests.failed', 1);
    }

    public function test_issue_isolation_roles_and_duplicate_rules(): void
    {
        [$p, $a, $b, , $failed] = $this->failedRun();
        $viewer = User::factory()->create();
        $this->actingAs($a)->putJson("/api/projects/$p/members", ['email' => $viewer->email, 'role' => 'viewer'])->assertOk();
        $first = $this->postJson("/api/projects/$p/issues", self::issuePayload(['step_result_id' => $failed]))->assertCreated()->json('data');
        $second = $this->postJson("/api/projects/$p/issues", self::issuePayload(['title' => 'مشكلة يدوية', 'severity' => 'minor']))->assertCreated()->assertJsonPath('data.number', 2)->json('data');

        $this->actingAs($viewer)->getJson("/api/projects/$p/issues/{$first['id']}")->assertOk()->assertJsonPath('data.permissions.comment', false);
        $this->postJson("/api/projects/$p/issues/{$first['id']}/comments", ['body' => 'x'])->assertForbidden();
        $this->postJson("/api/projects/$p/issues", self::issuePayload())->assertForbidden();

        $outsider = User::factory()->create();
        $this->actingAs($outsider);
        $other = $this->postJson('/api/projects', ['name' => 'Other'])->json('data.id');
        $this->getJson("/api/projects/$p/issues")->assertNotFound();
        $this->getJson("/api/projects/$p/issues/{$first['id']}")->assertNotFound();
        $this->getJson("/api/projects/$other/issues/{$first['id']}")->assertNotFound();
        $this->postJson("/api/projects/$other/issues", self::issuePayload(['step_result_id' => $failed]))->assertNotFound();
        $this->postJson("/api/projects/$other/issues/{$first['id']}/transition", ['to' => 'triaged', 'version' => 1])->assertNotFound();

        $this->actingAs($b)->patchJson("/api/projects/$p/issues/{$second['id']}", ['title' => 'لا أملكها', 'version' => 1])->assertForbidden();
        $this->actingAs($a)->patchJson("/api/projects/$p/issues/{$second['id']}", ['severity' => 'major', 'version' => 1])->assertOk()->assertJsonPath('data.severity', 'major')->assertJsonPath('data.version', 2);
        $this->patchJson("/api/projects/$p/issues/{$second['id']}", ['severity' => 'minor', 'version' => 1])->assertConflict();
        $this->move($p, ['id' => $second['id'], 'version' => 2], 'duplicate', ['note' => 'مكررة', 'duplicate_of_id' => $second['id']])->assertUnprocessable();
        $this->move($p, ['id' => $second['id'], 'version' => 2], 'duplicate', ['note' => 'مكررة', 'duplicate_of_id' => $first['id']])->assertOk()->assertJsonPath('data.duplicate_of.number', 1);
        $first = $this->move($p, $first, 'triaged')->json('data');
        $this->move($p, $first, 'assigned', ['assignee_id' => $viewer->id])->assertUnprocessable();
        $this->move($p, $first, 'assigned', ['assignee_id' => $outsider->id])->assertUnprocessable();
        $this->move($p, $first, 'wont_fix')->assertUnprocessable();
        $this->assertDatabaseMissing('issues', ['id' => $first['id'], 'assignee_id' => $outsider->id]);
    }
}
