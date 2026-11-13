<?php

namespace App\Services\Accounts;

use App\Models\Project;
use App\Models\User;
use App\Services\ProjectService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

/**
 * Single path for adding, re-roling and removing project members, used by the
 * project Team page, the platform users console and invitation acceptance.
 */
class MembershipService
{
    public const ROLES = ['manager', 'tester', 'viewer'];

    public function __construct(private ProjectService $projects, private AccountAudit $audit) {}

    /** Project owner, or an active platform admin. */
    public function canManage(User $actor, Project $project): bool
    {
        return $actor->isActive() && ($actor->isPlatformAdmin() || Gate::forUser($actor)->allows('manageMembers', $project));
    }

    public function upsert(Project $project, User $actor, User $member, string $role, bool $authorize = true, string $via = 'direct'): void
    {
        abort_unless(in_array($role, self::ROLES, true), 422, 'دور غير صالح.');
        if ($authorize) {
            abort_unless($this->canManage($actor, $project), 403);
        }
        abort_if($member->id === $project->owner_id, 422, 'لا يمكن تغيير دور مالك المشروع.');
        abort_unless($member->isActive(), 422, 'لا يمكن إضافة حساب غير نشط إلى مشروع.');
        DB::transaction(function () use ($project, $actor, $member, $role, $via) {
            Project::whereKey($project->id)->lockForUpdate()->firstOrFail();
            $current = DB::table('project_members')->where('project_id', $project->id)->where('user_id', $member->id)->value('role');
            if ($role === 'viewer') {
                $this->assertNoActiveRun($project, $member->id);
            }
            $project->members()->syncWithoutDetaching([$member->id => ['role' => $role]]);
            $this->projects->audit($project, $actor, 'member.updated', ['user_id' => $member->id, 'role' => $role, 'previous_role' => $current, 'via' => $via]);
            $this->audit->record($current ? 'membership.role_changed' : 'membership.added', $actor, $member->id, ['role' => $role, 'previous_role' => $current, 'via' => $via], projectId: $project->id);
        });
    }

    public function remove(Project $project, User $actor, int $memberId): void
    {
        abort_unless($this->canManage($actor, $project), 403);
        abort_if($memberId === $project->owner_id, 422, 'لا يمكن إزالة مالك المشروع.');
        DB::transaction(function () use ($project, $actor, $memberId) {
            Project::whereKey($project->id)->lockForUpdate()->firstOrFail();
            abort_unless($project->members()->where('users.id', $memberId)->exists(), 404);
            $this->assertNoActiveRun($project, $memberId);
            $project->members()->detach($memberId);
            $this->projects->audit($project, $actor, 'member.removed', ['user_id' => $memberId]);
            $this->audit->record('membership.removed', $actor, $memberId, [], projectId: $project->id);
        });
    }

    public function assertNoActiveRun(Project $project, int $userId): void
    {
        abort_if(DB::table('run_participants')->join('test_runs', 'test_runs.id', '=', 'run_participants.test_run_id')
            ->where('test_runs.project_id', $project->id)->where('run_participants.user_id', $userId)
            ->whereIn('test_runs.status', ['active', 'paused'])->exists(), 422, 'المختبر مشارك في جلسة نشطة. أنهِ الجلسة قبل تغيير وصوله.');
    }
}
