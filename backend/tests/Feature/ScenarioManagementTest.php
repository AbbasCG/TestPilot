<?php

namespace Tests\Feature;

use App\Models\ScenarioRevision;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ScenarioManagementTest extends TestCase
{
    use RefreshDatabase;

    public function fixture(): array
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $project = $this->postJson('/api/projects', ['name' => 'Scenario project'])->assertCreated()->json('data.id');
        $suite = $this->postJson("/api/projects/$project/suites", ['name' => 'Core', 'position' => 0, 'archived' => false])->assertCreated()->json('data.id');

        return [$project, $suite, $user];
    }

    public static function payload(int $suite): array
    {
        return array_merge(config('scenario_templates')[1]['content'], ['suite_id' => $suite, 'status' => 'ready']);
    }

    public function test_scenario_revisions_preserve_prior_content_and_reject_stale_updates(): void
    {
        [$project, $suite] = $this->fixture();
        $payload = self::payload($suite);
        $case = $this->postJson("/api/projects/$project/scenarios", $payload)->assertCreated()->json('data');
        $id = $case['id'];
        $this->putJson("/api/projects/$project/scenarios/$id", array_merge($payload, ['title' => 'Changed title', 'version' => 1]))->assertOk()->assertJsonPath('data.version', 2);
        $this->putJson("/api/projects/$project/scenarios/$id", array_merge($payload, ['version' => 1]))->assertConflict();
        $history = $this->getJson("/api/projects/$project/scenarios/$id/revisions")->assertOk()->assertJsonCount(2, 'data');
        $history->assertJsonPath('data.1.content.title', $payload['title']);
        $this->assertDatabaseHas('test_cases', ['id' => $id, 'title' => 'Changed title', 'version' => 2]);
        $this->assertDatabaseCount('scenario_revisions', 2);
    }

    public function test_project_and_nested_resource_isolation_and_cross_project_links(): void
    {
        [$project, $suite, $owner] = $this->fixture();
        $id = $this->postJson("/api/projects/$project/scenarios", self::payload($suite))->json('data.id');
        [$otherProject, $otherSuite, $outsider] = $this->fixture();
        $this->getJson("/api/projects/$project/scenarios/$id")->assertNotFound();
        $this->getJson("/api/projects/$otherProject/scenarios/$id/revisions")->assertNotFound();
        $this->postJson("/api/projects/$otherProject/scenarios", self::payload($suite))->assertUnprocessable();
        $this->postJson("/api/projects/$otherProject/scenarios", array_merge(self::payload($otherSuite), ['dependencies' => [$id]]))->assertUnprocessable();
        $this->actingAs($owner)->putJson("/api/projects/$project/members", ['email' => $outsider->email, 'role' => 'viewer'])->assertOk();
        $this->actingAs($outsider)->getJson("/api/projects/$project/scenarios/$id")->assertOk();
        $this->postJson("/api/projects/$project/scenarios", self::payload($suite))->assertForbidden();
        $this->assertDatabaseCount('test_cases', 1);
    }

    public function test_invalid_step_graph_and_shared_checkpoint_are_rejected(): void
    {
        [$project, $suite] = $this->fixture();
        $data = self::payload($suite);
        $data['steps'][0]['depends_on'] = [$data['steps'][1]['id']];
        $this->postJson("/api/projects/$project/scenarios", $data)->assertUnprocessable()->assertJsonValidationErrors('steps.0.depends_on');
        $data = self::payload($suite);
        $data['steps'][0]['type'] = 'shared_checkpoint';
        $this->postJson("/api/projects/$project/scenarios", $data)->assertUnprocessable()->assertJsonValidationErrors('steps.0.checkpoint');
        $data = self::payload($suite);
        $data['steps'][0]['expected_result'] = '';
        $response = $this->postJson("/api/projects/$project/scenarios", $data)->assertUnprocessable()->assertJsonValidationErrors('steps.0.expected_result');
        $this->assertSame('اكتب نتيجة متوقعة لكل خطوة قبل الحفظ.', $response->json('errors')['steps.0.expected_result'][0]);
        $this->assertDatabaseCount('test_cases', 0);
    }

    public function test_dependencies_cannot_be_cyclic(): void
    {
        [$project, $suite] = $this->fixture();
        $a = $this->postJson("/api/projects/$project/scenarios", self::payload($suite))->json('data.id');
        $b = $this->postJson("/api/projects/$project/scenarios", array_merge(self::payload($suite), ['dependencies' => [$a]]))->json('data.id');
        $this->putJson("/api/projects/$project/scenarios/$a", array_merge(self::payload($suite), ['dependencies' => [$b], 'version' => 1]))->assertUnprocessable();
        $this->assertDatabaseHas('test_cases', ['id' => $a, 'version' => 1]);
    }

    public function test_all_ten_templates_can_be_instantiated_and_suites_are_versioned(): void
    {
        [$project, $suite] = $this->fixture();
        $templates = $this->getJson("/api/projects/$project/scenario-templates")->assertOk()->assertJsonCount(10, 'data')->json('data');
        foreach ($templates as $template) {
            $this->postJson("/api/projects/$project/scenarios", array_merge($template['content'], ['suite_id' => $suite]))->assertCreated();
        }
        $this->getJson("/api/projects/$project/suites")->assertJsonPath('data.0.cases_count', 10);
        $this->putJson("/api/projects/$project/suites/$suite", ['name' => 'Archived', 'position' => 3, 'archived' => true, 'version' => 1])->assertOk()->assertJsonPath('data.version', 2);
        $this->postJson("/api/projects/$project/scenarios", self::payload($suite))->assertUnprocessable();
        $this->putJson("/api/projects/$project/suites/$suite", ['name' => 'Stale', 'position' => 0, 'archived' => false, 'version' => 1])->assertConflict();
        $this->assertDatabaseCount('scenario_revisions', 10);
    }

    public function test_environment_edit_archive_and_member_removal_preserve_owner(): void
    {
        [$project, , $owner] = $this->fixture();
        $tester = User::factory()->create();
        $id = $this->postJson("/api/projects/$project/environments", ['name' => 'Stage'])->json('data.id');
        $this->putJson("/api/projects/$project/environments/$id", ['name' => 'Updated', 'archived' => true, 'version' => 1])->assertOk()->assertJsonPath('data.archived', true);
        $this->putJson("/api/projects/$project/environments/$id", ['name' => 'Old', 'archived' => false, 'version' => 1])->assertConflict();
        $this->putJson("/api/projects/$project/members", ['email' => $tester->email, 'role' => 'tester'])->assertOk();
        $this->deleteJson("/api/projects/$project/members/{$owner->id}")->assertUnprocessable();
        $this->deleteJson("/api/projects/$project/members/{$tester->id}")->assertNoContent();
        $this->actingAs($tester)->getJson("/api/projects/$project")->assertNotFound();
        $this->assertDatabaseHas('environments', ['id' => $id, 'name' => 'Updated', 'version' => 2]);
    }

    public function test_revision_models_refuse_mutation(): void
    {
        [$project, $suite] = $this->fixture();
        $this->postJson("/api/projects/$project/scenarios", self::payload($suite))->assertCreated();
        $revision = ScenarioRevision::firstOrFail();
        $this->expectException(\LogicException::class);
        $revision->update(['content' => []]);
    }
}
