<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\CreatesCollaborativeRun;
use Tests\TestCase;

class AnalyticsReportTest extends TestCase
{
    use CreatesCollaborativeRun, RefreshDatabase;

    public function test_analytics_reflect_persisted_results_issues_and_readiness(): void
    {
        [$p, $a, $b, $run] = $this->collaborativeRun();
        $id = $run['id'];
        $this->putJson("/api/projects/$p/runs/$id/results/{$run['results'][0]['id']}", CollaborativeRunTest::resultPayload())->assertOk();
        $this->putJson("/api/projects/$p/runs/$id/results/{$run['results'][1]['id']}", CollaborativeRunTest::resultPayload(0, 'failed'))->assertOk();
        $this->actingAs($b)->putJson("/api/projects/$p/runs/$id/results/{$run['results'][2]['id']}", CollaborativeRunTest::resultPayload(0, 'blocked'))->assertOk();
        $this->postJson("/api/projects/$p/issues", IssueWorkflowTest::issuePayload(['step_result_id' => $run['results'][1]['id'], 'title' => '=HYPERLINK("http://evil")']))->assertCreated();

        $data = $this->actingAs($a)->getJson("/api/projects/$p/analytics?days=7")->assertOk()->json('data');
        $this->assertSame(['total' => 5, 'executed' => 3, 'passed' => 1, 'failed' => 1, 'blocked' => 1, 'pending' => 2, 'pass_rate' => 33.3], $data['results']);
        $this->assertSame(1, $data['issues']['critical_open']);
        $this->assertCount(7, $data['trends']);
        $this->assertSame(1, end($data['trends'])['failed']);
        $this->assertSame(1, end($data['trends'])['issues_opened']);
        $testers = collect($data['testers'])->keyBy('user_id');
        $this->assertSame(2, $testers[$a->id]['steps_executed']);
        $this->assertSame(1, $testers[$b->id]['blocked']);
        $this->assertSame(1, $testers[$b->id]['issues_reported']);
        $this->assertSame(33.3, $data['history'][0]['pass_rate']);
        $this->assertSame('v1.0', $data['readiness']['build']);
        $this->assertSame('not_ready', $data['readiness']['status']);
        $this->assertFalse(collect($data['readiness']['checks'])->firstWhere('key', 'no_critical_issues')['passed']);
        $this->getJson("/api/projects/$p/analytics?build=v9")->assertOk()->assertJsonPath('data.readiness.status', 'not_ready')->assertJsonPath('data.readiness.results.executed', 0);

        $comparison = $this->getJson('/api/analytics/projects')->assertOk()->json('data');
        $this->assertSame(33.3, $comparison[0]['pass_rate']);

        $outsider = User::factory()->create();
        $this->actingAs($outsider)->getJson("/api/projects/$p/analytics")->assertNotFound();
        $this->getJson("/api/projects/$p/reports/export?format=json")->assertNotFound();
        $this->assertSame([], $this->getJson('/api/analytics/projects')->json('data'));
    }

    public function test_exports_are_safe_complete_and_audited(): void
    {
        [$p, , , $run] = $this->collaborativeRun();
        $this->putJson("/api/projects/$p/runs/{$run['id']}/results/{$run['results'][0]['id']}", CollaborativeRunTest::resultPayload(0, 'failed'))->assertOk();
        $this->postJson("/api/projects/$p/issues", IssueWorkflowTest::issuePayload(['step_result_id' => $run['results'][0]['id'], 'title' => '=HYPERLINK("http://evil")']))->assertCreated();

        $csv = $this->get("/api/projects/$p/reports/export?format=csv&dataset=issues")->assertOk();
        $this->assertStringStartsWith('text/csv', $csv->headers->get('Content-Type'));
        $this->assertStringContainsString('attachment;', $csv->headers->get('Content-Disposition'));
        $body = $csv->getContent();
        $this->assertStringStartsWith("\u{FEFF}", $body);
        $this->assertStringContainsString('"\'=HYPERLINK(""http://evil"")"', $body);
        $this->assertStringNotContainsString(',"=HYPERLINK', $body);

        $summary = $this->get("/api/projects/$p/reports/export?format=csv")->assertOk()->getContent();
        $this->assertStringContainsString('"pass_rate","0"', $summary);

        $json = json_decode($this->get("/api/projects/$p/reports/export?format=json")->assertOk()->getContent(), true);
        $this->assertSame(1, $json['results']['failed']);
        $this->assertCount(1, $json['issue_list']);

        $markdown = $this->get("/api/projects/$p/reports/export?format=md")->assertOk()->getContent();
        $this->assertStringContainsString('# تقرير جودة: Collaboration', $markdown);
        $this->assertStringContainsString('غير جاهز', $markdown);
        $this->assertStringContainsString('=HYPERLINK("http://evil")', $markdown);

        $this->getJson("/api/projects/$p/reports/export?format=exe")->assertUnprocessable();
        $this->assertSame(4, DB::table('activity_logs')->where('project_id', $p)->where('action', 'report.exported')->count());
    }
}
