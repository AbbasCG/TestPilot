<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\CreatesCollaborativeRun;
use Tests\TestCase;

class EvidenceSweepTest extends TestCase
{
    use CreatesCollaborativeRun, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('evidence');
    }

    private function stored(string $path, int $hoursOld): void
    {
        Storage::disk('evidence')->put($path, 'x');
        touch(Storage::disk('evidence')->path($path), now()->subHours($hoursOld)->getTimestamp());
    }

    public function test_old_unreferenced_files_are_removed_and_everything_else_is_kept(): void
    {
        [$p, , , $run] = $this->collaborativeRun();
        $first = $run['results'][0]['id'];
        $this->putJson("/api/projects/$p/runs/{$run['id']}/results/$first", CollaborativeRunTest::resultPayload(0, 'failed'))->assertOk();
        $issue = $this->postJson("/api/projects/$p/issues", IssueWorkflowTest::issuePayload(['step_result_id' => $first]))->json('data.id');
        $saved = $this->post("/api/projects/$p/evidence", ['file' => UploadedFile::fake()->image('a.png', 40, 30), 'kind' => 'screenshot', 'issue_id' => $issue], ['Accept' => 'application/json'])->assertCreated()->json('data.id');
        $referenced = DB::table('evidence_files')->find($saved)->path;
        touch(Storage::disk('evidence')->path($referenced), now()->subDays(30)->getTimestamp());

        $orphan = "$p/".str_repeat('a', 40).'.png';
        $fresh = "$p/".str_repeat('b', 40).'.png';
        $foreign = "$p/notes.txt";
        $this->stored($orphan, 48);
        $this->stored($fresh, 1);
        $this->stored($foreign, 500);

        $this->artisan('testpilot:evidence-sweep', ['--dry-run' => true])->expectsOutputToContain('would remove 1 orphan')->assertSuccessful();
        Storage::disk('evidence')->assertExists($orphan);

        $this->artisan('testpilot:evidence-sweep')->expectsOutputToContain('removed 1 orphan')->assertSuccessful();
        Storage::disk('evidence')->assertMissing($orphan);
        Storage::disk('evidence')->assertExists([$referenced, $fresh, $foreign]);
        $this->assertDatabaseHas('evidence_files', ['id' => $saved, 'path' => $referenced]);
    }

    public function test_missing_files_are_reported_but_rows_are_kept_and_grace_is_validated(): void
    {
        [$p, , , $run] = $this->collaborativeRun();
        $first = $run['results'][0]['id'];
        $this->putJson("/api/projects/$p/runs/{$run['id']}/results/$first", CollaborativeRunTest::resultPayload(0, 'failed'))->assertOk();
        $issue = $this->postJson("/api/projects/$p/issues", IssueWorkflowTest::issuePayload(['step_result_id' => $first]))->json('data.id');
        $saved = $this->post("/api/projects/$p/evidence", ['file' => UploadedFile::fake()->image('a.png', 40, 30), 'kind' => 'screenshot', 'issue_id' => $issue], ['Accept' => 'application/json'])->assertCreated()->json('data.id');
        $path = DB::table('evidence_files')->find($saved)->path;
        Storage::disk('evidence')->delete($path);

        $this->artisan('testpilot:evidence-sweep')->expectsOutputToContain('1 database row(s) without a file')->assertSuccessful();
        $this->assertDatabaseHas('evidence_files', ['id' => $saved]);
        $this->artisan('testpilot:evidence-sweep', ['--grace' => 0])->assertFailed();
    }
}
