<?php

namespace App\Services;

use App\Models\Project;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Read-only quality analytics computed directly from persisted runs, step
 * results, issues and retest attempts. Every query is scoped to one project
 * (or to the caller's memberships for comparisons); nothing is cached or
 * estimated.
 */
class AnalyticsService
{
    /** Release readiness thresholds; shown to users alongside each check. */
    public const READINESS_MIN_PASS_RATE = 95.0;

    private function rate(int $passed, int $executed): ?float
    {
        return $executed > 0 ? round($passed * 100 / $executed, 1) : null;
    }

    /**
     * @return array{total: int, executed: int, passed: int, failed: int, blocked: int, pending: int, pass_rate: float|null}
     */
    private function resultCounts(int $projectId, ?string $build = null): array
    {
        $counts = DB::table('step_results')->join('test_runs', 'test_runs.id', '=', 'step_results.test_run_id')
            ->where('test_runs.project_id', $projectId)
            ->when($build, fn ($q) => $q->where('test_runs.build_version', $build))
            ->selectRaw('step_results.status, count(*) as total')->groupBy('step_results.status')
            ->pluck('total', 'status')->map(fn ($v) => (int) $v);
        $passed = $counts['passed'] ?? 0;
        $failed = $counts['failed'] ?? 0;
        $blocked = $counts['blocked'] ?? 0;
        $executed = $passed + $failed + $blocked;

        return ['total' => (int) $counts->sum(), 'executed' => $executed, 'passed' => $passed, 'failed' => $failed, 'blocked' => $blocked, 'pending' => $counts['pending'] ?? 0, 'pass_rate' => $this->rate($passed, $executed)];
    }

    /**
     * @return array<string, mixed>
     */
    public function project(Project $project, int $days = 30, ?string $build = null): array
    {
        $id = $project->id;
        $results = $this->resultCounts($id);
        $runs = DB::table('test_runs')->where('project_id', $id);
        $issues = DB::table('issues')->where('project_id', $id);
        $retests = DB::table('retest_attempts')->where('project_id', $id)->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status')->map(fn ($v) => (int) $v);
        $firstAttempt = DB::table('retest_attempts')->where('project_id', $id)->where('attempt_number', 1)->whereIn('status', ['passed', 'failed'])->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');
        $builds = DB::table('test_runs')->where('project_id', $id)->selectRaw('build_version, max(id) as latest')->groupBy('build_version')->orderByDesc('latest')->limit(20)->pluck('build_version');
        $build = $build ?: $builds->first();

        return [
            'generated_at' => now()->toIso8601String(),
            'project' => ['id' => $id, 'name' => $project->name, 'status' => $project->status],
            'results' => $results,
            'runs' => [
                'total' => (int) (clone $runs)->count(),
                'by_status' => (clone $runs)->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status')->map(fn ($v) => (int) $v),
                'by_outcome' => (clone $runs)->whereNotNull('outcome')->selectRaw('outcome, count(*) as total')->groupBy('outcome')->pluck('total', 'outcome')->map(fn ($v) => (int) $v),
            ],
            'issues' => [
                'total' => (int) (clone $issues)->count(),
                'open' => (int) (clone $issues)->whereIn('status', IssueWorkflow::OPEN)->count(),
                'critical_open' => (int) (clone $issues)->whereIn('status', IssueWorkflow::OPEN)->whereIn('severity', ['blocker', 'critical'])->count(),
                'by_status' => (clone $issues)->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status')->map(fn ($v) => (int) $v),
                'open_by_severity' => (clone $issues)->whereIn('status', IssueWorkflow::OPEN)->selectRaw('severity, count(*) as total')->groupBy('severity')->pluck('total', 'severity')->map(fn ($v) => (int) $v),
            ],
            'retests' => [
                'passed' => $retests['passed'] ?? 0, 'failed' => $retests['failed'] ?? 0, 'pending' => $retests['pending'] ?? 0, 'cancelled' => $retests['cancelled'] ?? 0,
                'first_attempt_pass_rate' => $this->rate((int) ($firstAttempt['passed'] ?? 0), (int) $firstAttempt->sum()),
            ],
            'testers' => $this->testers($id),
            'history' => $this->history($id),
            'trends' => $this->trends($id, $days),
            'builds' => $builds,
            'readiness' => $build ? $this->readiness($id, $build) : null,
        ];
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    private function testers(int $projectId): Collection
    {
        $members = DB::table('project_members')->join('users', 'users.id', '=', 'project_members.user_id')->where('project_id', $projectId)->orderBy('users.name')->get(['users.id', 'users.name', 'project_members.role']);
        $steps = DB::table('step_results')->join('run_participants', 'run_participants.id', '=', 'step_results.participant_id')->join('test_runs', 'test_runs.id', '=', 'step_results.test_run_id')
            ->where('test_runs.project_id', $projectId)->where('step_results.status', '!=', 'pending')
            ->selectRaw('run_participants.user_id, step_results.status, count(*) as total')->groupBy('run_participants.user_id', 'step_results.status')->get()->groupBy('user_id');
        $runs = DB::table('run_participants')->join('test_runs', 'test_runs.id', '=', 'run_participants.test_run_id')->where('test_runs.project_id', $projectId)->selectRaw('user_id, count(*) as total')->groupBy('user_id')->pluck('total', 'user_id');
        $reported = DB::table('issues')->where('project_id', $projectId)->selectRaw('reporter_id, count(*) as total')->groupBy('reporter_id')->pluck('total', 'reporter_id');
        $retests = DB::table('retest_attempts')->where('project_id', $projectId)->whereIn('status', ['passed', 'failed'])->selectRaw('assignee_id, count(*) as total')->groupBy('assignee_id')->pluck('total', 'assignee_id');
        $fixed = DB::table('issues')->where('project_id', $projectId)->whereIn('status', ['verified', 'closed'])->whereNotNull('assignee_id')->selectRaw('assignee_id, count(*) as total')->groupBy('assignee_id')->pluck('total', 'assignee_id');

        return $members->map(function ($member) use ($steps, $runs, $reported, $retests, $fixed) {
            $byStatus = collect($steps[$member->id] ?? [])->pluck('total', 'status')->map(fn ($v) => (int) $v);
            $executed = (int) $byStatus->sum();

            return [
                'user_id' => $member->id, 'name' => $member->name, 'role' => $member->role,
                'runs' => (int) ($runs[$member->id] ?? 0), 'steps_executed' => $executed,
                'passed' => $byStatus['passed'] ?? 0, 'failed' => $byStatus['failed'] ?? 0, 'blocked' => $byStatus['blocked'] ?? 0,
                'pass_rate' => $this->rate($byStatus['passed'] ?? 0, $executed),
                'issues_reported' => (int) ($reported[$member->id] ?? 0), 'retests_executed' => (int) ($retests[$member->id] ?? 0),
                'issues_resolved' => (int) ($fixed[$member->id] ?? 0),
            ];
        })->values();
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    private function history(int $projectId): Collection
    {
        $runs = DB::table('test_runs')->where('project_id', $projectId)->orderByDesc('id')->limit(50)->get(['id', 'title', 'build_version', 'status', 'outcome', 'environment_snapshot', 'created_at', 'completed_at']);
        $counts = DB::table('step_results')->whereIn('test_run_id', $runs->pluck('id'))->selectRaw('test_run_id, status, count(*) as total')->groupBy('test_run_id', 'status')->get()->groupBy('test_run_id');
        $issues = DB::table('issues')->whereIn('test_run_id', $runs->pluck('id'))->selectRaw('test_run_id, count(*) as total')->groupBy('test_run_id')->pluck('total', 'test_run_id');

        return $runs->map(function ($run) use ($counts, $issues) {
            $c = collect($counts[$run->id] ?? [])->pluck('total', 'status')->map(fn ($v) => (int) $v);
            $executed = ($c['passed'] ?? 0) + ($c['failed'] ?? 0) + ($c['blocked'] ?? 0);

            return [
                'id' => $run->id, 'title' => $run->title, 'build_version' => $run->build_version, 'status' => $run->status, 'outcome' => $run->outcome,
                'environment' => json_decode($run->environment_snapshot, true)['name'] ?? null,
                'created_at' => $run->created_at, 'completed_at' => $run->completed_at,
                'total' => (int) $c->sum(), 'passed' => $c['passed'] ?? 0, 'failed' => $c['failed'] ?? 0, 'blocked' => $c['blocked'] ?? 0, 'pending' => $c['pending'] ?? 0,
                'pass_rate' => $this->rate($c['passed'] ?? 0, $executed), 'issues' => (int) ($issues[$run->id] ?? 0),
            ];
        })->values();
    }

    /**
     * Daily series built from append-only result history (the latest
     * recorded state of each result on each day) and issue timestamps.
     *
     * @return list<array<string, mixed>>
     */
    private function trends(int $projectId, int $days): array
    {
        $start = CarbonImmutable::today()->subDays($days - 1);
        $recorded = DB::table('result_history')->join('step_results', 'step_results.id', '=', 'result_history.step_result_id')->join('test_runs', 'test_runs.id', '=', 'step_results.test_run_id')
            ->where('test_runs.project_id', $projectId)->where('result_history.created_at', '>=', $start)
            ->get(['result_history.created_at', 'result_history.content'])
            ->groupBy(fn ($row) => substr((string) $row->created_at, 0, 10))
            ->map(fn ($rows) => $rows->countBy(fn ($row) => json_decode($row->content, true)['status'] ?? 'unknown'));
        $opened = DB::table('issues')->where('project_id', $projectId)->where('created_at', '>=', $start)->get(['created_at'])->countBy(fn ($row) => substr((string) $row->created_at, 0, 10));
        $resolved = DB::table('issue_activities')->join('issues', 'issues.id', '=', 'issue_activities.issue_id')->where('issues.project_id', $projectId)
            ->where('issue_activities.event', 'status_changed')->where('issue_activities.created_at', '>=', $start)->get(['issue_activities.created_at', 'issue_activities.metadata'])
            ->filter(fn ($row) => in_array(json_decode($row->metadata, true)['to'] ?? null, ['verified', 'closed'], true))
            ->countBy(fn ($row) => substr((string) $row->created_at, 0, 10));
        $series = [];
        for ($day = $start; $day->lte(CarbonImmutable::today()); $day = $day->addDay()) {
            $key = $day->toDateString();
            $r = $recorded[$key] ?? collect();
            $series[] = ['date' => $key, 'passed' => (int) ($r['passed'] ?? 0), 'failed' => (int) ($r['failed'] ?? 0), 'blocked' => (int) ($r['blocked'] ?? 0), 'issues_opened' => (int) ($opened[$key] ?? 0), 'issues_resolved' => (int) ($resolved[$key] ?? 0)];
        }

        return $series;
    }

    /**
     * @return array<string, mixed>
     */
    public function readiness(int $projectId, string $build): array
    {
        $results = $this->resultCounts($projectId, $build);
        $runs = DB::table('test_runs')->where('project_id', $projectId)->where('build_version', $build);
        $openRuns = (int) (clone $runs)->where('status', '!=', 'completed')->count();
        $failedRuns = (int) (clone $runs)->where('outcome', 'failed')->count();
        $criticalOpen = (int) DB::table('issues')->where('project_id', $projectId)->whereIn('status', IssueWorkflow::OPEN)->whereIn('severity', ['blocker', 'critical'])->count();
        $pendingRetests = (int) DB::table('retest_attempts')->where('project_id', $projectId)->where('status', 'pending')->count();
        $reopened = (int) DB::table('issues')->where('project_id', $projectId)->where('status', 'reopened')->count();
        $checks = [
            ['key' => 'runs_exist', 'label' => 'توجد جلسات اختبار لهذا الإصدار', 'passed' => (clone $runs)->exists(), 'detail' => (string) (clone $runs)->count()],
            ['key' => 'runs_completed', 'label' => 'اكتملت جميع جلسات الإصدار بتقييم نهائي', 'passed' => $openRuns === 0, 'detail' => "$openRuns غير مكتملة"],
            ['key' => 'no_failed_runs', 'label' => 'لا توجد جلسة بتقييم نهائي فاشل', 'passed' => $failedRuns === 0, 'detail' => "$failedRuns فاشلة"],
            ['key' => 'pass_rate', 'label' => 'نسبة النجاح لا تقل عن '.self::READINESS_MIN_PASS_RATE.'%', 'passed' => $results['pass_rate'] !== null && $results['pass_rate'] >= self::READINESS_MIN_PASS_RATE, 'detail' => $results['pass_rate'] === null ? 'لا نتائج منفذة' : $results['pass_rate'].'%'],
            ['key' => 'no_pending_steps', 'label' => 'لا خطوات غير منفذة', 'passed' => $results['pending'] === 0, 'detail' => (string) $results['pending']],
            ['key' => 'no_critical_issues', 'label' => 'لا مشكلات حرجة أو معطِّلة مفتوحة في المشروع', 'passed' => $criticalOpen === 0, 'detail' => (string) $criticalOpen],
            ['key' => 'no_pending_retests', 'label' => 'لا إعادة اختبار معلّقة أو مشكلات أعيد فتحها', 'passed' => $pendingRetests === 0 && $reopened === 0, 'detail' => "$pendingRetests معلّقة · $reopened أعيد فتحها"],
        ];
        $failed = collect($checks)->where('passed', false)->pluck('key');
        $blocking = $failed->intersect(['runs_exist', 'no_failed_runs', 'no_critical_issues'])->isNotEmpty();
        $status = $failed->isEmpty() ? 'ready' : ($blocking ? 'not_ready' : 'at_risk');

        return ['build' => $build, 'status' => $status, 'results' => $results, 'checks' => $checks];
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    public function comparison(User $user): Collection
    {
        $projects = DB::table('projects')->join('project_members', 'project_members.project_id', '=', 'projects.id')
            ->where('project_members.user_id', $user->id)->orderBy('projects.name')->get(['projects.id', 'projects.name', 'projects.status', 'project_members.role']);

        return $projects->map(function ($project) {
            $results = $this->resultCounts($project->id);
            $issues = DB::table('issues')->where('project_id', $project->id)->whereIn('status', IssueWorkflow::OPEN);
            $lastRun = DB::table('test_runs')->where('project_id', $project->id)->orderByDesc('id')->first(['build_version', 'created_at']);

            return [
                'id' => $project->id, 'name' => $project->name, 'status' => $project->status, 'role' => $project->role,
                'runs' => (int) DB::table('test_runs')->where('project_id', $project->id)->count(),
                'executed' => $results['executed'], 'pass_rate' => $results['pass_rate'], 'failed' => $results['failed'], 'blocked' => $results['blocked'],
                'open_issues' => (int) (clone $issues)->count(), 'critical_open' => (int) (clone $issues)->whereIn('severity', ['blocker', 'critical'])->count(),
                'last_build' => $lastRun?->build_version, 'last_run_at' => $lastRun?->created_at,
            ];
        })->values();
    }
}
