<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProjectFoundationTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_access_is_rejected(): void
    {
        $this->getJson('/api/projects')->assertUnauthorized();
    }

    public function test_project_lifecycle_is_isolated_and_versioned(): void
    {
        $owner = User::factory()->create();
        $outsider = User::factory()->create();
        $this->actingAs($owner);
        $project = $this->postJson('/api/projects', ['name' => 'مشروع الجودة'])->assertCreated()->json('data');
        $id = $project['id'];
        $this->getJson("/api/projects/$id")->assertOk()->assertJsonPath('data.members.0.role', 'owner');
        $this->patchJson("/api/projects/$id", ['name' => 'Updated', 'version' => 1])->assertOk()->assertJsonPath('data.version', 2);
        $this->patchJson("/api/projects/$id", ['name' => 'Stale', 'version' => 1])->assertConflict();
        $this->assertDatabaseHas('projects', ['id' => $id, 'name' => 'Updated', 'version' => 2]);
        $this->actingAs($outsider)->getJson("/api/projects/$id")->assertNotFound();
        $this->getJson('/api/projects')->assertJsonCount(0, 'data');
        $this->getJson('/api/dashboard')->assertJsonPath('data.projects', 0);
        $this->getJson("/api/projects/$id/activity")->assertNotFound();
        $this->postJson("/api/projects/$id/environments", ['name' => 'Staging'])->assertNotFound();
    }

    public function test_roles_and_owner_invariant_are_enforced(): void
    {
        $owner = User::factory()->create();
        $tester = User::factory()->create();
        $manager = User::factory()->create();
        $this->actingAs($owner);
        $id = $this->postJson('/api/projects', ['name' => 'Permissions'])->json('data.id');
        $this->putJson("/api/projects/$id/members", ['email' => $tester->email, 'role' => 'tester'])->assertOk();
        $this->putJson("/api/projects/$id/members", ['email' => $manager->email, 'role' => 'manager'])->assertOk();
        $this->putJson("/api/projects/$id/members", ['email' => $owner->email, 'role' => 'viewer'])->assertUnprocessable();
        $this->actingAs($tester)->getJson("/api/projects/$id")->assertOk();
        $this->patchJson("/api/projects/$id", ['name' => 'Forbidden', 'version' => 1])->assertForbidden();
        $this->putJson("/api/projects/$id/members", ['email' => $tester->email, 'role' => 'manager'])->assertForbidden();
        $this->actingAs($manager)->postJson("/api/projects/$id/environments", ['name' => 'Staging', 'url' => 'https://example.com'])->assertCreated();
        $this->putJson("/api/projects/$id/members", ['email' => $tester->email, 'role' => 'manager'])->assertForbidden();
        $this->assertDatabaseCount('activity_logs', 4);
    }

    public function test_validation_and_environment_uniqueness(): void
    {
        $this->actingAs(User::factory()->create());
        $this->postJson('/api/projects', ['name' => ''])->assertUnprocessable();
        $id = $this->postJson('/api/projects', ['name' => 'Project'])->json('data.id');
        $this->postJson("/api/projects/$id/environments", ['name' => 'Stage', 'url' => 'javascript:alert(1)'])->assertUnprocessable();
        $this->postJson("/api/projects/$id/environments", ['name' => 'Stage'])->assertCreated();
        $this->postJson("/api/projects/$id/environments", ['name' => 'Stage'])->assertUnprocessable();
        $this->patchJson("/api/projects/$id", ['name' => 'No version'])->assertUnprocessable();
        $this->assertDatabaseCount('environments', 1);
    }

    public function test_login_logout_and_failed_credentials(): void
    {
        $user = User::factory()->create(['password' => 'long-test-password']);
        $headers = ['Origin' => 'http://localhost:5173'];
        $this->withHeaders($headers)->postJson('/api/login', ['email' => $user->email, 'password' => 'wrong'])->assertUnprocessable();
        $this->postJson('/api/login', ['email' => $user->email, 'password' => 'long-test-password'])->assertOk()->assertJsonMissingPath('data.password');
        $this->getJson('/api/user')->assertOk()->assertJsonPath('data.id', $user->id);
        $this->postJson('/api/logout')->assertNoContent();
        $this->assertGuest('web');
    }

    public function test_login_is_rate_limited(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->withHeaders(['Origin' => 'http://localhost:5173'])->postJson('/api/login', ['email' => 'rate@example.test', 'password' => 'wrong'])->assertUnprocessable();
        }
        $this->postJson('/api/login', ['email' => 'rate@example.test', 'password' => 'wrong'])->assertStatus(429);
    }
}
