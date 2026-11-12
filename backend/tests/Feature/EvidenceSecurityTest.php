<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\CreatesCollaborativeRun;
use Tests\TestCase;

class EvidenceSecurityTest extends TestCase
{
    use CreatesCollaborativeRun, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('evidence');
    }

    private function content(string $name, string $bytes): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'evidence');
        file_put_contents($path, $bytes);
        $this->beforeApplicationDestroyed(fn () => @unlink($path));

        return new UploadedFile($path, $name, null, null, true);
    }

    private function png(string $name = 'لقطة شاشة.png'): UploadedFile
    {
        return UploadedFile::fake()->image($name, 40, 30);
    }

    public function test_screenshot_is_reencoded_privately_named_and_only_downloadable_by_members(): void
    {
        [$p, $a, , $run] = $this->collaborativeRun();
        $first = $run['results'][0]['id'];
        $this->putJson("/api/projects/$p/runs/{$run['id']}/results/$first", CollaborativeRunTest::resultPayload(0, 'failed'))->assertOk();
        $issue = $this->postJson("/api/projects/$p/issues", IssueWorkflowTest::issuePayload(['step_result_id' => $first]))->json('data.id');

        $file = $this->post("/api/projects/$p/evidence", ['file' => $this->png('../../etc/<script>evil.png'), 'kind' => 'screenshot', 'issue_id' => $issue], ['Accept' => 'application/json'])
            ->assertCreated()->assertJsonPath('data.mime', 'image/png')->json('data');
        $this->assertSame('scriptevil.png', $file['original_name']);
        $stored = DB::table('evidence_files')->find($file['id']);
        $this->assertMatchesRegularExpression("#^$p/[0-9a-f]{40}\\.png$#", $stored->path);
        Storage::disk('evidence')->assertExists($stored->path);
        $this->assertSame(hash('sha256', Storage::disk('evidence')->get($stored->path)), $stored->sha256);
        $this->assertDatabaseHas('issue_activities', ['issue_id' => $issue, 'event' => 'evidence_added']);

        $download = $this->get("/api/projects/$p/evidence/{$file['id']}")->assertOk();
        $this->assertStringStartsWith('attachment', $download->headers->get('Content-Disposition'));
        $this->assertSame('nosniff', $download->headers->get('X-Content-Type-Options'));
        $this->assertStringContainsString('private', $download->headers->get('Cache-Control'));
        $this->assertStringContainsString('sandbox', $download->headers->get('Content-Security-Policy'));
        $this->assertStringStartsWith('inline', $this->get("/api/projects/$p/evidence/{$file['id']}?inline=1")->headers->get('Content-Disposition'));
        $this->assertDatabaseHas('activity_logs', ['project_id' => $p, 'action' => 'evidence.downloaded']);

        $this->actingAs(User::factory()->create());
        $other = $this->postJson('/api/projects', ['name' => 'Other'])->json('data.id');
        $this->getJson("/api/projects/$p/evidence/{$file['id']}")->assertNotFound();
        $this->getJson("/api/projects/$other/evidence/{$file['id']}")->assertNotFound();
        $this->post("/api/projects/$other/evidence", ['file' => $this->png(), 'kind' => 'screenshot', 'issue_id' => $issue], ['Accept' => 'application/json'])->assertNotFound();
        $this->assertDatabaseCount('evidence_files', 1);
    }

    public function test_spoofed_dangerous_and_oversized_files_are_rejected(): void
    {
        [$p, , , $run] = $this->collaborativeRun();
        $issue = $this->postJson("/api/projects/$p/issues", IssueWorkflowTest::issuePayload())->json('data.id');
        $upload = fn (UploadedFile $file, string $kind = 'screenshot') => $this->post("/api/projects/$p/evidence", ['file' => $file, 'kind' => $kind, 'issue_id' => $issue], ['Accept' => 'application/json']);

        $upload($this->content('shell.png', '<?php system($_GET["c"]); ?>'))->assertUnprocessable();
        $upload($this->content('icon.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))->assertUnprocessable();
        $upload($this->content('page.txt', '<html><script>alert(1)</script></html>'), 'attachment')->assertUnprocessable();
        $upload($this->content('fake.pdf', 'MZ'.str_repeat("\0", 64)), 'attachment')->assertUnprocessable();
        $upload($this->png(), 'video')->assertUnprocessable();
        $upload($this->content('notes.txt', 'ملاحظات اختبار سليمة'), 'attachment')->assertCreated();
        config(['evidence.limits.attachment' => 10]);
        $upload($this->content('long.txt', str_repeat('a', 11)), 'attachment')->assertUnprocessable();
        $this->post("/api/projects/$p/evidence", ['file' => $this->png(), 'kind' => 'screenshot'], ['Accept' => 'application/json'])->assertUnprocessable();
        $this->post("/api/projects/$p/evidence", ['file' => $this->png(), 'kind' => 'screenshot', 'issue_id' => $issue, 'step_result_id' => $run['results'][0]['id']], ['Accept' => 'application/json'])->assertUnprocessable();
        $this->assertDatabaseCount('evidence_files', 1);
        $this->assertCount(1, Storage::disk('evidence')->allFiles());
    }

    public function test_evidence_required_step_accepts_only_owner_upload_and_viewers_cannot_upload(): void
    {
        [$p, $a, $b, $run] = $this->collaborativeRun(function (array $content) {
            $content['steps'][0]['evidence_required'] = true;

            return $content;
        });
        $first = $run['results'][0]['id'];
        $this->putJson("/api/projects/$p/runs/{$run['id']}/results/$first", CollaborativeRunTest::resultPayload())->assertUnprocessable();
        $this->actingAs($b)->post("/api/projects/$p/evidence", ['file' => $this->png(), 'kind' => 'screenshot', 'step_result_id' => $first], ['Accept' => 'application/json'])->assertForbidden();
        $this->actingAs($a)->post("/api/projects/$p/evidence", ['file' => $this->png(), 'kind' => 'screenshot', 'step_result_id' => $first], ['Accept' => 'application/json'])->assertCreated();
        $this->putJson("/api/projects/$p/runs/{$run['id']}/results/$first", CollaborativeRunTest::resultPayload())->assertOk();
        $this->getJson("/api/projects/$p/runs/{$run['id']}")->assertJsonCount(1, 'data.evidence')->assertJsonPath('data.evidence.0.step_result_id', $first);

        $viewer = User::factory()->create();
        $this->putJson("/api/projects/$p/members", ['email' => $viewer->email, 'role' => 'viewer'])->assertOk();
        $issue = $this->postJson("/api/projects/$p/issues", IssueWorkflowTest::issuePayload())->json('data.id');
        $this->actingAs($viewer)->post("/api/projects/$p/evidence", ['file' => $this->png(), 'kind' => 'screenshot', 'issue_id' => $issue], ['Accept' => 'application/json'])->assertForbidden();
        $this->get("/api/projects/$p/evidence/".DB::table('evidence_files')->value('id'))->assertOk();
    }
}
