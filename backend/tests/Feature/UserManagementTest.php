<?php

namespace Tests\Feature;

use App\Models\Invitation;
use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class UserManagementTest extends TestCase
{
    use RefreshDatabase;

    private const NEW_PASSWORD = 'Brand-New-Secret-2026';

    private function origin(): array
    {
        return ['Origin' => 'http://localhost:5173', 'Referer' => 'http://localhost:5173/'];
    }

    private function login(string $email, string $password): TestResponse
    {
        Auth::forgetGuards();

        return $this->withHeaders($this->origin())->postJson('/api/login', ['email' => $email, 'password' => $password]);
    }

    private function auditText(): string
    {
        return DB::table('account_activities')->pluck('metadata')->implode(' ').' '.DB::table('activity_logs')->pluck('metadata')->implode(' ');
    }

    public function test_admin_creates_account_with_generated_temporary_password_that_must_be_changed(): void
    {
        $owner = User::factory()->platformOwner()->create();
        $project = $this->actingAs($owner)->postJson('/api/projects', ['name' => 'ثراء'])->json('data.id');
        $created = $this->postJson('/api/admin/users', ['name' => 'سارة', 'email' => 'Sara@Example.test', 'method' => 'temporary_password', 'password_mode' => 'generate', 'project_id' => $project, 'project_role' => 'tester'])
            ->assertCreated()->assertJsonPath('data.user.email', 'sara@example.test')->assertJsonPath('data.user.state', 'must_change_password')->json('data');
        $temporary = $created['temporary_password'];
        $this->assertGreaterThanOrEqual(20, strlen($temporary));
        $user = User::where('email', 'sara@example.test')->first();
        $this->assertNotSame($temporary, $user->password);
        $this->assertTrue(Hash::check($temporary, $user->password));
        $this->assertStringNotContainsString($temporary, $this->auditText());
        $this->assertDatabaseHas('project_members', ['project_id' => $project, 'user_id' => $user->id, 'role' => 'tester']);
        $this->getJson("/api/admin/users/{$user->id}")->assertOk()->assertJsonMissingPath('data.temporary_password')->assertJsonMissingPath('data.password');

        $this->login('sara@example.test', $temporary)->assertOk()->assertJsonPath('data.must_change_password', true);
        $this->getJson('/api/user')->assertOk();
        $this->getJson('/api/dashboard')->assertForbidden()->assertJsonPath('code', 'password_change_required');
        $this->getJson("/api/projects/$project")->assertForbidden();
        $this->postJson('/api/account/password', ['current_password' => 'wrong-password', 'password' => self::NEW_PASSWORD, 'password_confirmation' => self::NEW_PASSWORD])->assertUnprocessable()->assertJsonValidationErrors('current_password');
        $this->postJson('/api/account/password', ['current_password' => $temporary, 'password' => 'short', 'password_confirmation' => 'short'])->assertUnprocessable()->assertJsonValidationErrors('password');
        $this->postJson('/api/account/password', ['current_password' => $temporary, 'password' => $temporary, 'password_confirmation' => $temporary])->assertUnprocessable();
        $this->postJson('/api/account/password', ['current_password' => $temporary, 'password' => self::NEW_PASSWORD, 'password_confirmation' => self::NEW_PASSWORD])
            ->assertOk()->assertJsonPath('data.must_change_password', false);
        $this->getJson('/api/dashboard')->assertOk();
        $this->assertNotNull($user->fresh()->password_changed_at);
        $this->assertDatabaseHas('account_activities', ['user_id' => $user->id, 'action' => 'account.password_changed']);
        $this->assertStringNotContainsString(self::NEW_PASSWORD, $this->auditText());

        $this->postJson('/api/logout')->assertNoContent();
        $this->login('sara@example.test', $temporary)->assertUnprocessable();
        $this->login('sara@example.test', self::NEW_PASSWORD)->assertOk();
    }

    public function test_manual_temporary_password_duplicates_and_privilege_escalation_are_refused(): void
    {
        $owner = User::factory()->platformOwner()->create();
        $admin = User::factory()->platformAdmin()->create();
        $regular = User::factory()->create(['email' => 'taken@example.test']);
        $this->actingAs($owner)->postJson('/api/admin/users', ['name' => 'يدوي', 'email' => 'manual@example.test', 'method' => 'temporary_password', 'password_mode' => 'manual', 'temporary_password' => 'weakpass'])->assertUnprocessable();
        $this->postJson('/api/admin/users', ['name' => 'يدوي', 'email' => 'manual@example.test', 'method' => 'temporary_password', 'password_mode' => 'manual', 'temporary_password' => 'Manual-Temp-Pass-99'])
            ->assertCreated()->assertJsonPath('data.temporary_password', null);
        $this->postJson('/api/admin/users', ['name' => 'مكرر', 'email' => 'TAKEN@example.test', 'method' => 'temporary_password', 'password_mode' => 'generate'])
            ->assertConflict()->assertJsonPath('code', 'account_exists')->assertJsonPath('user.id', $regular->id);
        $this->assertSame(1, User::whereRaw('lower(email) = ?', ['taken@example.test'])->count());

        $this->actingAs($admin)->postJson('/api/admin/users', ['name' => 'مدير', 'email' => 'boss@example.test', 'method' => 'temporary_password', 'password_mode' => 'generate', 'platform_role' => 'admin'])->assertForbidden();
        $this->putJson("/api/admin/users/{$regular->id}/platform-role", ['platform_role' => 'owner'])->assertForbidden();
        $this->postJson("/api/admin/users/{$owner->id}/status", ['status' => 'suspended', 'reason' => 'محاولة'])->assertForbidden();
        $this->postJson("/api/admin/users/{$owner->id}/temporary-password", ['password_mode' => 'generate'])->assertForbidden();
        $this->actingAs($regular)->getJson('/api/admin/users')->assertForbidden();
        $this->postJson('/api/admin/users', ['name' => 'x', 'email' => 'x@example.test', 'method' => 'temporary_password', 'password_mode' => 'generate'])->assertForbidden();

        $this->actingAs($owner)->postJson("/api/admin/users/{$owner->id}/status", ['status' => 'suspended', 'reason' => 'ذاتي'])->assertUnprocessable();
        $this->putJson("/api/admin/users/{$owner->id}/platform-role", ['platform_role' => 'admin'])->assertUnprocessable();
        $this->putJson("/api/admin/users/{$admin->id}/platform-role", ['platform_role' => 'owner'])->assertOk();
        $this->putJson("/api/admin/users/{$owner->id}/platform-role", ['platform_role' => 'admin'])->assertOk()->assertJsonPath('data.platform_role', 'admin');
        $this->assertDatabaseHas('account_activities', ['user_id' => $owner->id, 'action' => 'account.platform_role_changed']);
    }

    public function test_project_owner_invites_new_user_who_accepts_once_and_joins_with_the_role(): void
    {
        $owner = User::factory()->create();
        $project = $this->actingAs($owner)->postJson('/api/projects', ['name' => 'Team'])->json('data.id');
        $delivery = $this->postJson("/api/projects/$project/invitations", ['email' => 'New.Tester@Example.test', 'role' => 'tester'])
            ->assertCreated()->assertJsonPath('data.delivery', 'manual_link')->assertJsonPath('data.invitation.state', 'pending')->json('data');
        $token = $delivery['token'];
        $this->assertSame(48, strlen($token));
        $stored = Invitation::first();
        $this->assertSame(hash('sha256', $token), $stored->token_hash);
        $this->assertSame('new.tester@example.test', $stored->email);
        $this->assertStringNotContainsString($token, $this->auditText().json_encode($this->getJson("/api/projects/$project/invitations")->json()));
        $this->postJson("/api/projects/$project/invitations", ['email' => 'new.tester@example.test', 'role' => 'viewer'])->assertConflict();

        Auth::forgetGuards();
        $this->app['auth']->guard('web')->logout();
        $this->getJson("/api/invite/$token")->assertOk()->assertJsonPath('data.state', 'pending')->assertJsonPath('data.account_exists', false)
            ->assertJsonPath('data.project.name', 'Team')->assertJsonMissingPath('data.token_hash');
        $this->postJson("/api/invite/$token/accept", ['name' => 'مختبر جديد', 'password' => 'short', 'password_confirmation' => 'short'])->assertUnprocessable();
        $this->withHeaders($this->origin())->postJson("/api/invite/$token/accept", ['name' => 'مختبر جديد', 'password' => self::NEW_PASSWORD, 'password_confirmation' => self::NEW_PASSWORD])
            ->assertOk()->assertJsonPath('data.project_id', $project)->assertJsonPath('data.user.must_change_password', false);
        $user = User::where('email', 'new.tester@example.test')->first();
        $this->assertDatabaseHas('project_members', ['project_id' => $project, 'user_id' => $user->id, 'role' => 'tester']);
        $this->assertSame('accepted', $stored->fresh()->status);
        $this->getJson("/api/projects/$project")->assertOk();
        $this->postJson("/api/invite/$token/accept", ['name' => 'مرة ثانية', 'password' => self::NEW_PASSWORD, 'password_confirmation' => self::NEW_PASSWORD])->assertStatus(410);
        $this->assertDatabaseHas('account_activities', ['invitation_id' => $stored->id, 'action' => 'invitation.accepted']);
    }

    public function test_invitations_expire_can_be_revoked_and_resending_invalidates_the_old_link(): void
    {
        $owner = User::factory()->create();
        $project = $this->actingAs($owner)->postJson('/api/projects', ['name' => 'Expiry'])->json('data.id');
        $first = $this->postJson("/api/projects/$project/invitations", ['email' => 'late@example.test', 'role' => 'viewer'])->json('data');
        $resent = $this->postJson("/api/invitations/{$first['invitation']['id']}/resend")->assertOk()->json('data');
        $this->assertNotSame($first['token'], $resent['token']);
        $this->assertSame(2, $resent['invitation']['send_count']);
        $this->getJson("/api/invite/{$first['token']}")->assertNotFound();
        $this->getJson("/api/invite/{$resent['token']}")->assertOk();

        $this->travel(config('testpilot.invitation_ttl_hours') + 1)->hours();
        $this->getJson("/api/invite/{$resent['token']}")->assertOk()->assertJsonPath('data.state', 'expired');
        $this->postJson("/api/invite/{$resent['token']}/accept", ['name' => 'متأخر', 'password' => self::NEW_PASSWORD, 'password_confirmation' => self::NEW_PASSWORD])->assertStatus(410);
        $this->travelBack();

        $other = $this->actingAs($owner)->postJson("/api/projects/$project/invitations", ['email' => 'revoked@example.test', 'role' => 'tester'])->json('data');
        $this->postJson("/api/invitations/{$other['invitation']['id']}/revoke")->assertOk()->assertJsonPath('data.state', 'revoked');
        $this->postJson("/api/invite/{$other['token']}/accept", ['name' => 'ملغى', 'password' => self::NEW_PASSWORD, 'password_confirmation' => self::NEW_PASSWORD])->assertStatus(410);
        $this->assertDatabaseMissing('users', ['email' => 'revoked@example.test']);
        $this->assertDatabaseMissing('users', ['email' => 'late@example.test']);
    }

    public function test_existing_account_must_be_signed_in_as_invitee_and_inviting_never_reveals_accounts(): void
    {
        $owner = User::factory()->create();
        $existing = User::factory()->create(['email' => 'existing@example.test']);
        $stranger = User::factory()->create();
        $project = $this->actingAs($owner)->postJson('/api/projects', ['name' => 'Private'])->json('data.id');

        $known = $this->postJson("/api/projects/$project/members/resolve", ['email' => 'existing@example.test'])->assertOk()->json('data');
        $unknown = $this->postJson("/api/projects/$project/members/resolve", ['email' => 'nobody@example.test'])->assertOk()->json('data');
        $this->assertSame(['state' => 'unknown', 'can_create_account' => false], $known);
        $this->assertSame($known, $unknown);
        $directKnown = $this->putJson("/api/projects/$project/members", ['email' => 'existing@example.test', 'role' => 'tester'])->assertUnprocessable()->json('errors.email');
        $directUnknown = $this->putJson("/api/projects/$project/members", ['email' => 'nobody@example.test', 'role' => 'tester'])->assertUnprocessable()->json('errors.email');
        $this->assertSame($directKnown, $directUnknown);
        $this->assertStringNotContainsString('invalid', json_encode($directKnown));

        $token = $this->postJson("/api/projects/$project/invitations", ['email' => 'existing@example.test', 'role' => 'manager'])->assertCreated()->json('data.token');
        Auth::forgetGuards();
        $this->app['auth']->guard('web')->logout();
        $this->postJson("/api/invite/$token/accept")->assertConflict();
        $this->actingAs($stranger)->postJson("/api/invite/$token/accept")->assertConflict();
        $this->actingAs($existing)->postJson("/api/invite/$token/accept")->assertOk();
        $this->assertDatabaseHas('project_members', ['project_id' => $project, 'user_id' => $existing->id, 'role' => 'manager']);
        $this->assertSame(1, User::where('email', 'existing@example.test')->count());
    }

    public function test_invitation_management_is_isolated_between_projects(): void
    {
        $ownerA = User::factory()->create();
        $ownerB = User::factory()->create();
        $tester = User::factory()->create();
        $a = $this->actingAs($ownerA)->postJson('/api/projects', ['name' => 'A'])->json('data.id');
        $invitation = $this->postJson("/api/projects/$a/invitations", ['email' => 'a-only@example.test', 'role' => 'tester'])->json('data.invitation.id');
        DB::table('project_members')->insert(['project_id' => $a, 'user_id' => $tester->id, 'role' => 'tester', 'created_at' => now(), 'updated_at' => now()]);
        $b = $this->actingAs($ownerB)->postJson('/api/projects', ['name' => 'B'])->json('data.id');
        $this->postJson("/api/projects/$a/invitations", ['email' => 'x@example.test', 'role' => 'tester'])->assertNotFound();
        $this->getJson("/api/projects/$a/invitations")->assertNotFound();
        $this->postJson("/api/invitations/$invitation/revoke")->assertForbidden();
        $this->postJson("/api/invitations/$invitation/resend")->assertForbidden();
        $this->actingAs($tester)->postJson("/api/projects/$a/invitations", ['email' => 'y@example.test', 'role' => 'tester'])->assertForbidden();
        $this->postJson("/api/projects/$a/members/resolve", ['email' => 'y@example.test'])->assertForbidden();
        $this->assertSame(1, Invitation::count());
        $this->assertNotSame($a, $b);
    }

    public function test_suspension_blocks_access_revokes_sessions_and_reactivation_restores_it(): void
    {
        config(['session.driver' => 'database']);
        $owner = User::factory()->platformOwner()->create();
        $user = User::factory()->create(['password' => self::NEW_PASSWORD]);
        DB::table('sessions')->insert(['id' => 'other-device', 'user_id' => $user->id, 'payload' => 'x', 'last_activity' => time()]);
        $this->actingAs($user)->getJson('/api/dashboard')->assertOk();
        $this->actingAs($owner)->postJson("/api/admin/users/{$user->id}/status", ['status' => 'suspended'])->assertUnprocessable()->assertJsonValidationErrors('reason');
        $this->postJson("/api/admin/users/{$user->id}/status", ['status' => 'suspended', 'reason' => 'مغادرة الفريق مؤقتًا'])->assertOk()->assertJsonPath('data.state', 'suspended');
        $this->assertDatabaseMissing('sessions', ['id' => 'other-device']);
        $this->getJson("/api/admin/users/{$user->id}")->assertJsonPath('data.status_reason', 'مغادرة الفريق مؤقتًا');

        $this->actingAs($user->fresh())->getJson('/api/dashboard')->assertForbidden()->assertJsonPath('code', 'account_inactive');
        $this->login($user->email, self::NEW_PASSWORD)->assertForbidden()->assertJsonPath('code', 'account_inactive');

        $this->actingAs($owner)->postJson("/api/admin/users/{$user->id}/status", ['status' => 'active'])->assertOk()->assertJsonPath('data.state', 'active');
        $this->login($user->email, self::NEW_PASSWORD)->assertOk();
        $this->assertSame(['suspended', 'active'], DB::table('account_activities')->where('user_id', $user->id)->where('action', 'account.status_changed')->orderByDesc('id')->get()->map(fn ($r) => json_decode($r->metadata, true)['from'])->all());

        $this->actingAs($owner)->postJson("/api/admin/users/{$user->id}/status", ['status' => 'disabled', 'reason' => 'إغلاق الحساب'])->assertOk();
        $this->login($user->email, self::NEW_PASSWORD)->assertForbidden();
    }

    public function test_admin_console_lists_filters_and_manages_memberships_without_sensitive_fields(): void
    {
        $owner = User::factory()->platformOwner()->create(['name' => 'المالك']);
        $member = User::factory()->create(['name' => 'منى', 'email' => 'mona@example.test']);
        User::factory()->create(['name' => 'معلّق', 'status' => 'suspended']);
        $project = $this->actingAs($owner)->postJson('/api/projects', ['name' => 'Console'])->json('data.id');
        $this->putJson("/api/admin/users/{$member->id}/memberships", ['project_id' => $project, 'role' => 'tester'])->assertOk()->assertJsonPath('data.projects.0.role', 'tester');
        $this->putJson("/api/admin/users/{$member->id}/memberships", ['project_id' => $project, 'role' => 'manager'])->assertOk()->assertJsonPath('data.projects.0.role', 'manager');

        $list = $this->getJson('/api/admin/users?search=mona')->assertOk()->assertJsonCount(1, 'data')->json();
        $this->assertSame(3, $list['summary']['total']);
        $this->assertSame(1, $list['summary']['inactive']);
        $this->getJson('/api/admin/users?state=suspended')->assertJsonCount(1, 'data');
        $this->getJson("/api/admin/users?project_id=$project")->assertJsonCount(2, 'data');
        $this->getJson('/api/admin/users?sort=name&direction=asc')->assertOk();
        $json = json_encode($this->getJson("/api/admin/users/{$member->id}")->assertOk()->json());
        foreach (['password', 'remember_token', 'token_hash'] as $secret) {
            $this->assertStringNotContainsString("\"$secret\"", $json);
        }
        $this->assertStringContainsString('membership.role_changed', $json);

        $this->deleteJson("/api/admin/users/{$member->id}/memberships/$project")->assertNoContent();
        $this->assertDatabaseMissing('project_members', ['project_id' => $project, 'user_id' => $member->id]);
        $this->deleteJson("/api/admin/users/{$owner->id}/memberships/$project")->assertUnprocessable();
    }

    public function test_password_recovery_does_not_reveal_accounts_and_reset_links_are_single_use(): void
    {
        $user = User::factory()->create(['email' => 'reset@example.test', 'must_change_password' => true]);
        $disabled = $this->postJson('/api/password/forgot', ['email' => 'reset@example.test'])->assertOk()->json('data');
        $this->assertFalse($disabled['mail_enabled']);
        $this->assertSame($disabled, $this->postJson('/api/password/forgot', ['email' => 'ghost@example.test'])->json('data'));
        $this->getJson('/api/auth/options')->assertJsonPath('data.mail_enabled', false);

        config(['testpilot.mail_enabled' => true]);
        Notification::fake();
        $enabled = $this->postJson('/api/password/forgot', ['email' => 'reset@example.test'])->assertOk()->json('data');
        $this->assertSame($enabled, $this->postJson('/api/password/forgot', ['email' => 'ghost@example.test'])->json('data'));
        $token = null;
        Notification::assertSentTo($user, ResetPassword::class, function (ResetPassword $notification) use (&$token) {
            $token = $notification->token;

            return true;
        });
        Notification::assertSentTimes(ResetPassword::class, 1);
        $this->postJson('/api/password/reset', ['token' => 'wrong', 'email' => 'reset@example.test', 'password' => self::NEW_PASSWORD, 'password_confirmation' => self::NEW_PASSWORD])->assertUnprocessable();
        $this->postJson('/api/password/reset', ['token' => $token, 'email' => 'reset@example.test', 'password' => self::NEW_PASSWORD, 'password_confirmation' => self::NEW_PASSWORD])->assertOk();
        $this->assertFalse($user->fresh()->must_change_password);
        $this->postJson('/api/password/reset', ['token' => $token, 'email' => 'reset@example.test', 'password' => 'Another-Secret-2026', 'password_confirmation' => 'Another-Secret-2026'])->assertUnprocessable();
        $this->login('reset@example.test', self::NEW_PASSWORD)->assertOk();
    }
}
