<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Everything assigned to one user across the active projects they belong to: the open sessions they take part
 * in (with their own remaining steps), the retests waiting for them and the open issues they must fix.
 * Membership is the boundary; sessions and retests also require a working (non-viewer) role.
 */
class MyWorkService
{
    public const LIMIT = 50;

    /** @return array<string, mixed> */
    public function for(User $actor): array
    {
        $activeIds = $actor->projects()->where('projects.status', 'active')->select('projects.id')->getQuery();
        $workIds = $actor->projects()->where('projects.status', 'active')
            ->wherePivotIn('role', ['owner', 'manager', 'tester'])->select('projects.id')->getQuery();

        $mine = fn (string $status) => DB::table('step_results')->whereColumn('step_results.participant_id', 'run_participants.id')
            ->when($status !== '', fn ($q) => $q->where('step_results.status', $status))->selectRaw('count(*)');
        $runs = DB::table('test_runs')->join('run_participants', 'run_participants.test_run_id', '=', 'test_runs.id')
            ->where('run_participants.user_id', $actor->id)
            ->whereIn('test_runs.project_id', $workIds)->whereIn('test_runs.status', ['active', 'paused']);

        $retests = DB::table('retest_attempts')->whereIn('retest_attempts.project_id', $workIds)
            ->where('retest_attempts.assignee_id', $actor->id)->where('retest_attempts.status', 'pending');

        $issues = DB::table('issues')->whereIn('issues.project_id', $activeIds)
            ->where('issues.assignee_id', $actor->id)->whereIn('issues.status', IssueWorkflow::OPEN);

        return [
            'counts' => ['runs' => (clone $runs)->count(), 'retests' => (clone $retests)->count(), 'issues' => (clone $issues)->count()],
            'runs' => $runs->join('projects', 'projects.id', '=', 'test_runs.project_id')
                ->select(['test_runs.id', 'test_runs.project_id', 'projects.name as project_name', 'test_runs.title', 'test_runs.status',
                    'test_runs.build_version', 'test_runs.updated_at', 'run_participants.role as my_role'])
                ->selectSub($mine('pending'), 'my_pending')->selectSub($mine(''), 'my_total')
                ->orderByRaw("case when test_runs.status = 'active' then 0 else 1 end")
                ->orderByDesc('test_runs.updated_at')->orderByDesc('test_runs.id')->limit(self::LIMIT)->get()
                ->map(fn ($r) => [...(array) $r, 'my_pending' => (int) $r->my_pending, 'my_total' => (int) $r->my_total]),
            'retests' => $retests->join('issues', 'issues.id', '=', 'retest_attempts.issue_id')
                ->join('projects', 'projects.id', '=', 'retest_attempts.project_id')
                ->orderBy('retest_attempts.created_at')->orderBy('retest_attempts.id')->limit(self::LIMIT)
                ->get(['retest_attempts.id', 'retest_attempts.project_id', 'projects.name as project_name', 'retest_attempts.issue_id',
                    'issues.number', 'issues.title', 'issues.severity', 'retest_attempts.attempt_number', 'retest_attempts.build_version',
                    'retest_attempts.created_at']),
            'issues' => $issues->join('projects', 'projects.id', '=', 'issues.project_id')
                ->orderByRaw("case issues.severity when 'blocker' then 0 when 'critical' then 1 when 'major' then 2 when 'minor' then 3 else 4 end")
                ->orderByDesc('issues.updated_at')->orderByDesc('issues.id')->limit(self::LIMIT)
                ->get(['issues.id', 'issues.project_id', 'projects.name as project_name', 'issues.number', 'issues.title',
                    'issues.status', 'issues.severity', 'issues.priority', 'issues.updated_at']),
        ];
    }
}
