<?php

namespace App\Services;

use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class ProjectService
{
    /** @return array<string, mixed> */
    public function dashboard(User $actor): array
    {
        $projects = $actor->projects();
        $activeProjects = $actor->projects()->where('projects.status', 'active');
        $activeIds = (clone $activeProjects)->select('projects.id')->getQuery();
        $workIds = $actor->projects()->where('projects.status', 'active')
            ->wherePivotIn('role', ['owner', 'manager', 'tester'])->select('projects.id')->getQuery();

        $runs = DB::table('test_runs')->whereIn('test_runs.project_id', $activeIds);
        $openRuns = (clone $runs)->whereIn('test_runs.status', ['active', 'paused']);
        $openIssues = DB::table('issues')->whereIn('issues.project_id', $activeIds)->whereIn('issues.status', IssueWorkflow::OPEN);
        $criticalIssues = (clone $openIssues)->whereIn('severity', ['blocker', 'critical']);
        $retests = DB::table('retest_attempts')->whereIn('retest_attempts.project_id', $workIds)
            ->where('retest_attempts.assignee_id', $actor->id)->where('retest_attempts.status', 'pending');
        $outcomes = $runs->where('status', 'completed')->where('completed_at', '>=', now()->subDays(7))
            ->selectRaw('outcome, count(*) as total')->groupBy('outcome')->pluck('total', 'outcome');

        return [
            'projects' => $projects->count(),
            'active_projects' => $activeProjects->count(),
            'environments' => DB::table('environments')->whereIn('project_id', $actor->projects()->select('projects.id'))->count(),
            'open_runs' => $openRuns->count(),
            'open_issues' => $openIssues->count(),
            'critical_open' => $criticalIssues->count(),
            'my_pending_retests' => $retests->count(),
            'outcomes_last_7_days' => [
                'passed' => (int) ($outcomes['passed'] ?? 0),
                'failed' => (int) ($outcomes['failed'] ?? 0),
                'inconclusive' => (int) ($outcomes['inconclusive'] ?? 0),
            ],
            'my_runs' => $openRuns->whereIn('test_runs.project_id', $workIds)
                ->whereIn('test_runs.id', DB::table('run_participants')->where('user_id', $actor->id)->select('test_run_id'))
                ->join('projects', 'projects.id', '=', 'test_runs.project_id')
                ->orderByDesc('test_runs.updated_at')->orderByDesc('test_runs.id')->limit(5)
                ->get(['test_runs.id', 'test_runs.project_id', 'projects.name as project_name', 'test_runs.title',
                    'test_runs.status', 'test_runs.build_version']),
            'my_retests' => $retests->join('issues', 'issues.id', '=', 'retest_attempts.issue_id')
                ->join('projects', 'projects.id', '=', 'retest_attempts.project_id')
                ->orderBy('retest_attempts.created_at')->orderBy('retest_attempts.id')->limit(5)
                ->get(['retest_attempts.id', 'retest_attempts.project_id', 'projects.name as project_name',
                    'retest_attempts.issue_id', 'issues.number', 'issues.title', 'retest_attempts.build_version']),
            'critical_issues' => $criticalIssues->join('projects', 'projects.id', '=', 'issues.project_id')
                ->orderByRaw("case when issues.severity = 'blocker' then 0 else 1 end")
                ->orderByDesc('issues.updated_at')->orderByDesc('issues.id')->limit(5)
                ->get(['issues.id', 'issues.project_id', 'projects.name as project_name', 'issues.number',
                    'issues.title', 'issues.status', 'issues.severity']),
        ];
    }

    public function audit(Project $project, User $actor, string $action, array $metadata = []): void
    {
        DB::table('activity_logs')->insert([
            'project_id' => $project->id, 'actor_id' => $actor->id,
            'action' => $action, 'metadata' => json_encode($metadata, JSON_THROW_ON_ERROR), 'created_at' => now(),
        ]);
    }

    public function create(User $actor, array $data): Project
    {
        return DB::transaction(function () use ($actor, $data) {
            $project = new Project($data);
            $project->owner_id = $actor->id;
            $project->save();
            $project->members()->attach($actor, ['role' => 'owner']);
            $this->audit($project, $actor, 'project.created');

            return $project;
        });
    }

    public function update(Project $project, User $actor, array $data): Project
    {
        return DB::transaction(function () use ($project, $actor, $data) {
            $locked = Project::query()->lockForUpdate()->findOrFail($project->id);
            abort_if($locked->version !== (int) $data['version'], 409, 'تم تعديل المشروع. حدّث الصفحة قبل الحفظ.');
            $locked->fill($data);
            $locked->version++;
            $locked->save();
            $this->audit($locked, $actor, 'project.updated');

            return $locked;
        });
    }
}
