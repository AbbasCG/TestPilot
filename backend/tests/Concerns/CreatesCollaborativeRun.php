<?php

namespace Tests\Concerns;

use App\Models\User;

trait CreatesCollaborativeRun
{
    /**
     * Owner A invites tester B and starts a run of the two-person template.
     *
     * @param  callable(array<string, mixed>): array<string, mixed>|null  $customize
     * @return array{0: int, 1: User, 2: User, 3: array<string, mixed>, 4: array<string, mixed>, 5: array<string, mixed>}
     */
    protected function collaborativeRun(?callable $customize = null): array
    {
        $a = User::factory()->platformOwner()->create();
        $b = User::factory()->create();
        $this->actingAs($a);
        $p = $this->postJson('/api/projects', ['name' => 'Collaboration'])->json('data.id');
        $this->putJson("/api/projects/$p/members", ['email' => $b->email, 'role' => 'tester'])->assertOk();
        $suite = $this->postJson("/api/projects/$p/suites", ['name' => 'Invitations', 'position' => 0, 'archived' => false])->json('data.id');
        $environment = $this->postJson("/api/projects/$p/environments", ['name' => 'Stage'])->json('data.id');
        $content = array_merge(config('scenario_templates')[9]['content'], ['suite_id' => $suite, 'status' => 'ready']);
        if ($customize) {
            $content = $customize($content);
        }
        $scenario = $this->postJson("/api/projects/$p/scenarios", $content)->assertCreated()->json('data');
        $input = ['title' => 'Two-person run', 'build_version' => 'v1.0', 'environment_id' => $environment, 'suite_id' => $suite, 'tester_a_id' => $a->id, 'tester_b_id' => $b->id, 'scenarios' => [['id' => $scenario['id'], 'version' => 1]]];
        $run = $this->postJson("/api/projects/$p/runs", $input)->assertCreated()->json('data');

        return [$p, $a, $b, $run, $scenario, $input];
    }
}
