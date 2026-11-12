<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TharaaImportTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_tharaa_scenario_passes_the_public_scenario_validation(): void
    {
        $data = require database_path('data/tharaa.php');
        $this->actingAs(User::factory()->create());
        $p = $this->postJson('/api/projects', ['name' => 'Validation'])->json('data.id');
        $suite = $this->postJson("/api/projects/$p/suites", ['name' => 'S', 'position' => 0, 'archived' => false])->json('data.id');
        $count = 0;
        foreach ($data['suites'] as $group) {
            foreach ($group['scenarios'] as $content) {
                $this->postJson("/api/projects/$p/scenarios", [...$content, 'suite_id' => $suite])->assertCreated();
                $roles = array_unique(array_column($content['steps'], 'assigned_role'));
                $this->assertContains('A', $roles, $content['title']);
                $this->assertContains('B', $roles, $content['title']);
                $this->assertContains('shared_checkpoint', array_column($content['steps'], 'type'), $content['title']);
                $count++;
            }
        }
        $this->assertCount(6, $data['suites']);
        $this->assertGreaterThanOrEqual(12, $count);
    }

    public function test_import_is_additive_idempotent_and_keeps_known_issue_open(): void
    {
        $owner = User::factory()->create(['email' => 'qa-owner@example.test']);
        $users = User::count();

        $this->artisan('testpilot:import-tharaa', ['owner' => 'missing@example.test'])->assertFailed();
        $this->artisan('testpilot:import-tharaa', ['owner' => 'qa-owner@example.test', '--dry-run' => true])->assertSuccessful();
        $this->assertDatabaseCount('projects', 0);

        $this->artisan('testpilot:import-tharaa', ['owner' => 'qa-owner@example.test'])->assertSuccessful();
        $project = DB::table('projects')->where('name', 'ثراء')->first();
        $this->assertNotNull($project);
        $this->assertSame($owner->id, (int) $project->owner_id);
        $this->assertDatabaseHas('environments', ['project_id' => $project->id, 'url' => 'https://demo.tharaaplatform.com/']);
        $this->assertSame(6, DB::table('test_suites')->where('project_id', $project->id)->count());
        $teacher = DB::table('test_cases')->where('project_id', $project->id)->where('title', 'like', 'TEST-TEACHER-001%')->first();
        $this->assertSame('ready', $teacher->status);
        $this->assertSame('المؤسسات والمجموعات', DB::table('test_suites')->find($teacher->suite_id)->name);
        $issue = DB::table('issues')->where('project_id', $project->id)->first();
        $this->assertStringContainsString('THR-AUD-143', $issue->title);
        $this->assertSame('triaged', $issue->status);
        $this->assertNull($issue->closed_at);
        $scenarios = DB::table('test_cases')->where('project_id', $project->id)->count();

        $this->artisan('testpilot:import-tharaa', ['owner' => 'qa-owner@example.test'])->assertSuccessful();
        $this->assertSame($scenarios, DB::table('test_cases')->where('project_id', $project->id)->count());
        $this->assertSame(1, DB::table('issues')->where('project_id', $project->id)->count());
        $this->assertSame(1, DB::table('projects')->count());
        $this->assertSame($users, User::count());

        $this->actingAs($owner)->getJson("/api/projects/{$project->id}/issues/{$issue->id}")->assertOk()
            ->assertJsonPath('data.status', 'triaged')->assertJsonPath('data.comments.0.author_id', $owner->id);
    }
}
