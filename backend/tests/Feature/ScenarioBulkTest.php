<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class ScenarioBulkTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: int, 1: int, 2: User, 3: list<array<string, mixed>>} */
    private function fixture(int $count = 3): array
    {
        $owner = User::factory()->platformOwner()->create();
        $this->actingAs($owner);
        $project = $this->postJson('/api/projects', ['name' => 'Bulk project'])->assertCreated()->json('data.id');
        $suite = $this->postJson("/api/projects/$project/suites", ['name' => 'Core', 'position' => 0, 'archived' => false])->json('data.id');
        $scenarios = [];
        for ($i = 1; $i <= $count; $i++) {
            $scenarios[] = $this->postJson("/api/projects/$project/scenarios", [...ScenarioManagementTest::payload($suite), 'title' => "Scenario $i", 'status' => 'draft'])
                ->assertCreated()->json('data');
        }

        return [$project, $suite, $owner, $scenarios];
    }

    /** @param list<array<string, mixed>> $scenarios */
    private function bulk(int $project, array $scenarios, array $change): TestResponse
    {
        return $this->postJson("/api/projects/$project/scenarios/bulk", [
            'items' => array_map(fn ($s) => ['id' => $s['id'], 'version' => $s['version']], $scenarios), ...$change,
        ]);
    }

    public function test_bulk_status_and_suite_changes_create_revisions_and_skip_unchanged(): void
    {
        [$project, $suite, , $scenarios] = $this->fixture();
        $this->bulk($project, [$scenarios[0], $scenarios[1]], ['action' => 'status', 'status' => 'ready'])->assertOk()
            ->assertJsonPath('data', ['updated' => 2, 'unchanged' => 0]);
        $this->assertDatabaseHas('test_cases', ['id' => $scenarios[0]['id'], 'status' => 'ready', 'version' => 2]);
        $this->assertDatabaseHas('test_cases', ['id' => $scenarios[2]['id'], 'status' => 'draft', 'version' => 1]);
        $this->getJson("/api/projects/$project/scenarios/{$scenarios[0]['id']}/revisions")->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.content.status', 'ready')->assertJsonPath('data.0.content.title', 'Scenario 1')
            ->assertJsonPath('data.1.content.status', 'draft');

        $current = collect($this->getJson("/api/projects/$project/scenarios")->json('data'))->sortBy('id')->values()->all();
        $this->bulk($project, $current, ['action' => 'status', 'status' => 'ready'])->assertOk()->assertJsonPath('data', ['updated' => 1, 'unchanged' => 2]);

        $other = $this->postJson("/api/projects/$project/suites", ['name' => 'Other', 'position' => 1, 'archived' => false])->json('data.id');
        $current = collect($this->getJson("/api/projects/$project/scenarios")->json('data'))->sortBy('id')->values()->all();
        $this->bulk($project, $current, ['action' => 'suite', 'suite_id' => $other])->assertOk()->assertJsonPath('data.updated', 3);
        $this->assertDatabaseMissing('test_cases', ['suite_id' => $suite]);
        $this->getJson("/api/projects/$project/scenarios/{$scenarios[2]['id']}")->assertJsonPath('data.content.suite_id', $other);
        $this->assertDatabaseCount('scenario_revisions', 3 + 3 + 3);
    }

    public function test_bulk_is_all_or_nothing_on_stale_or_foreign_scenarios(): void
    {
        [$project, , , $scenarios] = $this->fixture();
        $stale = [$scenarios[0], [...$scenarios[1], 'version' => 9]];
        $this->bulk($project, $stale, ['action' => 'status', 'status' => 'archived'])->assertConflict();
        $this->assertDatabaseMissing('test_cases', ['status' => 'archived']);

        [$otherProject, , , $foreign] = $this->fixture(1);
        $this->bulk($otherProject, [$foreign[0], $scenarios[0]], ['action' => 'status', 'status' => 'archived'])->assertNotFound();
        $this->assertDatabaseMissing('test_cases', ['status' => 'archived']);
        $this->assertDatabaseCount('scenario_revisions', 4);
    }

    public function test_bulk_validates_input_roles_and_archived_targets(): void
    {
        [$project, $suite, $owner, $scenarios] = $this->fixture(1);
        $this->bulk($project, $scenarios, ['action' => 'status', 'status' => 'published'])->assertUnprocessable()->assertJsonValidationErrors('status');
        $this->bulk($project, $scenarios, ['action' => 'status'])->assertUnprocessable()->assertJsonValidationErrors('status');
        $this->bulk($project, $scenarios, ['action' => 'status', 'status' => 'ready', 'suite_id' => $suite])->assertUnprocessable()->assertJsonValidationErrors('suite_id');
        $this->bulk($project, [], ['action' => 'status', 'status' => 'ready'])->assertUnprocessable()->assertJsonValidationErrors('items');
        $this->bulk($project, [$scenarios[0], $scenarios[0]], ['action' => 'status', 'status' => 'ready'])->assertUnprocessable()->assertJsonValidationErrors('items.0.id');

        $archived = $this->postJson("/api/projects/$project/suites", ['name' => 'Old', 'position' => 1, 'archived' => true])->json('data.id');
        $this->bulk($project, $scenarios, ['action' => 'suite', 'suite_id' => $archived])->assertUnprocessable()->assertJsonValidationErrors('suite_id');
        [, $foreignSuite] = $this->fixture(0);
        $this->actingAs($owner);
        $this->bulk($project, $scenarios, ['action' => 'suite', 'suite_id' => $foreignSuite])->assertUnprocessable()->assertJsonValidationErrors('suite_id');

        $viewer = User::factory()->create();
        $this->putJson("/api/projects/$project/members", ['email' => $viewer->email, 'role' => 'viewer'])->assertOk();
        $this->actingAs($viewer);
        $this->bulk($project, $scenarios, ['action' => 'status', 'status' => 'ready'])->assertForbidden();
        $this->actingAs(User::factory()->create());
        $this->bulk($project, $scenarios, ['action' => 'status', 'status' => 'ready'])->assertNotFound();

        $this->actingAs($owner)->patchJson("/api/projects/$project", ['name' => 'Bulk project', 'status' => 'archived', 'version' => 1])->assertOk();
        $this->bulk($project, $scenarios, ['action' => 'status', 'status' => 'ready'])->assertUnprocessable();
        $this->assertDatabaseHas('test_cases', ['id' => $scenarios[0]['id'], 'status' => 'draft', 'version' => 1]);
    }
}
