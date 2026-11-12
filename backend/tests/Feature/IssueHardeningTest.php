<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\CreatesCollaborativeRun;
use Tests\TestCase;

/**
 * Regression coverage for findings from the M8 security and code reviews.
 */
class IssueHardeningTest extends TestCase
{
    use CreatesCollaborativeRun, RefreshDatabase;

    private function move(int $p, array $issue, string $to, array $extra = []): TestResponse
    {
        return $this->postJson("/api/projects/$p/issues/{$issue['id']}/transition", array_merge(['to' => $to, 'version' => $issue['version']], $extra));
    }

    public function test_reclassification_retest_independence_and_reassignment(): void
    {
        [$p, $a, $b] = $this->collaborativeRun();
        $c = User::factory()->create();
        $this->putJson("/api/projects/$p/members", ['email' => $c->email, 'role' => 'tester'])->assertOk();
        $issue = $this->actingAs($b)->postJson("/api/projects/$p/issues", IssueWorkflowTest::issuePayload(['severity' => 'blocker']))->json('data');
        $this->patchJson("/api/projects/$p/issues/{$issue['id']}", ['severity' => 'critical', 'version' => 1])->assertOk();
        $issue = $this->actingAs($a)->move($p, ['id' => $issue['id'], 'version' => 2], 'triaged')->json('data');
        $this->actingAs($b)->patchJson("/api/projects/$p/issues/{$issue['id']}", ['severity' => 'trivial', 'version' => $issue['version']])->assertForbidden();
        $this->patchJson("/api/projects/$p/issues/{$issue['id']}", ['title' => 'عنوان أوضح للمشكلة', 'version' => $issue['version']])->assertOk();

        $issue = $this->actingAs($a)->getJson("/api/projects/$p/issues/{$issue['id']}")->json('data');
        $issue = $this->move($p, $issue, 'assigned', ['assignee_id' => $c->id])->json('data');
        $issue = $this->actingAs($c)->move($p, $issue, 'in_progress')->json('data');
        $this->move($p, $issue, 'ready_for_retest', ['note' => 'إصلاح', 'build_version' => 'v2', 'retest_assignee_id' => $c->id])->assertUnprocessable();
        $this->actingAs($a)->move($p, $issue, 'ready_for_retest', ['note' => 'إصلاح', 'build_version' => 'v2', 'retest_assignee_id' => $a->id])->assertUnprocessable();
        $issue = $this->getJson("/api/projects/$p/issues/{$issue['id']}")->json('data');
        $issue = $this->move($p, $issue, 'ready_for_retest', ['note' => 'إصلاح', 'build_version' => 'v2', 'retest_assignee_id' => $b->id])->assertOk()->json('data');
        $attempt = $issue['retests'][0];

        $this->actingAs($b)->putJson("/api/projects/$p/retests/{$attempt['id']}/assignee", ['assignee_id' => $a->id, 'version' => $attempt['version']])->assertForbidden();
        $this->actingAs($a)->putJson("/api/projects/$p/retests/{$attempt['id']}/assignee", ['assignee_id' => $c->id, 'version' => $attempt['version']])->assertUnprocessable();
        $this->putJson("/api/projects/$p/retests/{$attempt['id']}/assignee", ['assignee_id' => $a->id, 'version' => $attempt['version']])->assertUnprocessable();

        $issue = $this->move($p, $issue, 'in_progress')->assertOk()->json('data');
        $this->assertSame('cancelled', $issue['retests'][0]['status']);
        $this->assertDatabaseCount('retest_attempts', 1);
        $this->actingAs($b)->putJson("/api/projects/$p/retests/{$attempt['id']}", ['version' => 2, 'status' => 'passed', 'actual_result' => 'نجح', 'verified' => true])->assertConflict();
    }

    public function test_reopen_clears_duplicate_link_and_resolution_and_chains_cannot_cycle(): void
    {
        [$p] = $this->collaborativeRun();
        $make = fn (string $title) => $this->postJson("/api/projects/$p/issues", IssueWorkflowTest::issuePayload(['title' => $title]))->json('data');
        [$x, $y, $z] = [$make('المشكلة X'), $make('المشكلة Y'), $make('المشكلة Z')];
        $y = $this->move($p, $y, 'duplicate', ['note' => 'مكررة', 'duplicate_of_id' => $z['id']])->assertOk()->json('data');
        $x = $this->move($p, $x, 'duplicate', ['note' => 'مكررة', 'duplicate_of_id' => $y['id']])->assertOk()->json('data');
        $this->move($p, $z, 'duplicate', ['note' => 'مكررة', 'duplicate_of_id' => $x['id']])->assertUnprocessable();

        $x = $this->move($p, $x, 'reopened', ['note' => 'ليست مكررة'])->assertOk()->json('data');
        $this->assertNull($x['duplicate_of']);
        $this->assertNull($x['resolution']);
        $x = $this->move($p, $x, 'assigned', ['assignee_id' => $x['reporter_id']])->json('data');
        $x = $this->move($p, $x, 'wont_fix', ['note' => 'خارج النطاق'])->json('data');
        $closed = $this->move($p, $x, 'closed')->assertOk()->json('data');
        $this->patchJson("/api/projects/$p/issues/{$x['id']}", ['title' => 'تعديل بعد الإغلاق', 'version' => $closed['version']])->assertConflict();
        Storage::fake('evidence');
        $this->post("/api/projects/$p/evidence", ['file' => UploadedFile::fake()->image('a.png', 4, 4), 'kind' => 'screenshot', 'issue_id' => $x['id']], ['Accept' => 'application/json'])->assertConflict();
        $this->move($p, $closed, 'reopened', ['note' => 'ظهرت مجددًا'])->assertOk()->assertJsonPath('data.status', 'reopened')->assertJsonPath('data.closed_at', null);
    }

    public function test_linked_result_is_frozen_and_analytics_count_only_verified_fixes(): void
    {
        [$p, $a, $b, $run] = $this->collaborativeRun();
        $id = $run['id'];
        $first = $run['results'][0]['id'];
        $this->putJson("/api/projects/$p/runs/$id/results/$first", CollaborativeRunTest::resultPayload(0, 'failed'))->assertOk();
        $this->putJson("/api/projects/$p/runs/$id/results/$first", CollaborativeRunTest::resultPayload(1, 'passed'))->assertOk();
        $this->putJson("/api/projects/$p/runs/$id/results/$first", CollaborativeRunTest::resultPayload(2, 'failed'))->assertOk();
        $issue = $this->postJson("/api/projects/$p/issues", IssueWorkflowTest::issuePayload(['step_result_id' => $first]))->json('data');
        $this->putJson("/api/projects/$p/runs/$id/results/$first", CollaborativeRunTest::resultPayload(3, 'passed'))->assertConflict();
        $this->assertDatabaseHas('step_results', ['id' => $first, 'status' => 'failed', 'version' => 3]);

        $issue = $this->move($p, $issue, 'triaged')->json('data');
        $issue = $this->move($p, $issue, 'assigned', ['assignee_id' => $a->id])->json('data');
        $issue = $this->move($p, $issue, 'in_progress')->json('data');
        $issue = $this->move($p, $issue, 'ready_for_retest', ['note' => 'إصلاح', 'build_version' => 'v1.1', 'retest_assignee_id' => $b->id])->json('data');
        $attempt = $issue['retests'][0];
        $issue = $this->actingAs($b)->putJson("/api/projects/$p/retests/{$attempt['id']}", ['version' => 1, 'status' => 'passed', 'actual_result' => 'نجح الإصلاح', 'verified' => true])->json('data');
        $this->actingAs($a)->move($p, $issue, 'closed')->assertOk();

        $data = $this->getJson("/api/projects/$p/analytics?days=7")->json('data');
        $today = end($data['trends']);
        $this->assertSame(1, $today['failed']);
        $this->assertSame(0, $today['passed']);
        $this->assertSame(1, $today['issues_resolved']);
        $this->assertSame(1, collect($data['testers'])->firstWhere('user_id', $a->id)['issues_resolved']);
        $this->assertSame(0, collect($data['testers'])->firstWhere('user_id', $b->id)['issues_resolved']);
    }

    public function test_release_readiness_reports_ready_only_when_every_check_passes(): void
    {
        [$p, $a, $b, $run] = $this->collaborativeRun();
        $users = [$run['participants'][0]['id'] => $a, $run['participants'][1]['id'] => $b];
        foreach ($run['results'] as $result) {
            $this->actingAs($users[$result['participant_id']])->putJson("/api/projects/$p/runs/{$run['id']}/results/{$result['id']}", CollaborativeRunTest::resultPayload())->assertOk();
        }
        $this->actingAs($a)->getJson("/api/projects/$p/analytics")->assertJsonPath('data.readiness.status', 'at_risk');
        $version = $this->getJson("/api/projects/$p/runs/{$run['id']}")->json('data.version');
        $this->postJson("/api/projects/$p/runs/{$run['id']}/transition", ['action' => 'complete', 'version' => $version, 'outcome' => 'passed', 'summary' => 'تحقق المختبران من كل النتائج.'])->assertOk();
        $readiness = $this->getJson("/api/projects/$p/analytics")->json('data.readiness');
        $this->assertSame('ready', $readiness['status']);
        $this->assertSame(100.0, (float) $readiness['results']['pass_rate']);
        $this->assertTrue(collect($readiness['checks'])->every(fn ($check) => $check['passed']));
    }

    public function test_markdown_export_neutralises_links_html_and_table_breaks(): void
    {
        [$p] = $this->collaborativeRun();
        $this->postJson("/api/projects/$p/issues", IssueWorkflowTest::issuePayload(['title' => '![x](https://evil.test/p) <img src=x onerror=alert(1)> a|b `c`']))->assertCreated();
        $markdown = $this->get("/api/projects/$p/reports/export?format=md")->assertOk()->getContent();
        $this->assertStringNotContainsString('<img', $markdown);
        $this->assertStringNotContainsString('](https://evil', $markdown);
        $this->assertStringContainsString('\\!\\[x\\]\\(https://evil.test/p\\) &lt;img src=x onerror=alert\\(1\\)&gt; a\\|b \\`c\\`', $markdown);
        $this->assertSame(1, DB::table('issues')->count());
    }
}
