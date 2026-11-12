<?php

namespace App\Services;

use App\Models\Issue;
use App\Models\Project;
use App\Models\RetestAttempt;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

class IssueService
{
    public function __construct(private ProjectService $audit, private EvidenceService $evidence) {}

    public function role(Project $project, User $user): ?string
    {
        return DB::table('project_members')->where('project_id', $project->id)->where('user_id', $user->id)->value('role');
    }

    public function isManager(Project $project, User $user): bool
    {
        return in_array($this->role($project, $user), ['owner', 'manager'], true);
    }

    private function lockProject(Project $project, User $actor): Project
    {
        $locked = Project::whereKey($project->id)->lockForUpdate()->firstOrFail();
        Gate::forUser($actor)->authorize('designTests', $locked);
        abort_if($locked->status === 'archived', 422, 'أعد تفعيل المشروع قبل تعديل المشكلات.');

        return $locked;
    }

    private function lockIssue(Project $project, int $issueId, int $version): Issue
    {
        $issue = Issue::where('project_id', $project->id)->lockForUpdate()->findOrFail($issueId);
        abort_if($issue->version !== $version, 409, 'تغيرت المشكلة. حدّث الصفحة قبل الحفظ.');

        return $issue;
    }

    private function assertWorker(Project $project, int $userId): void
    {
        $role = DB::table('project_members')->where('project_id', $project->id)->where('user_id', $userId)->value('role');
        if (! in_array($role, ['owner', 'manager', 'tester'], true)) {
            throw ValidationException::withMessages(['assignee_id' => 'يجب أن يكون المكلَّف عضوًا غير مشاهد في المشروع.']);
        }
    }

    public function activity(Issue $issue, User $actor, string $event, array $metadata = []): void
    {
        DB::table('issue_activities')->insert([
            'issue_id' => $issue->id, 'actor_id' => $actor->id, 'event' => $event,
            'metadata' => json_encode($metadata, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), 'created_at' => now(),
        ]);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(Project $project, User $actor, array $data): Issue
    {
        return DB::transaction(function () use ($project, $actor, $data) {
            $project = $this->lockProject($project, $actor);
            $issue = new Issue($data);
            $issue->project_id = $project->id;
            $issue->reporter_id = $actor->id;
            $issue->status = 'new';
            $issue->version = 1;
            if (! empty($data['step_result_id'])) {
                $result = DB::table('step_results')->join('test_runs', 'test_runs.id', '=', 'step_results.test_run_id')
                    ->where('test_runs.project_id', $project->id)->where('step_results.id', $data['step_result_id'])
                    ->lockForUpdate()->first(['step_results.*', 'test_runs.environment_id', 'test_runs.environment_snapshot', 'test_runs.build_version as run_build']);
                abort_unless($result, 404);
                abort_unless(in_array($result->status, ['failed', 'blocked'], true), 422, 'تُنشأ المشكلة من نتيجة فاشلة أو متعذرة محفوظة فقط.');
                $existing = Issue::where('step_result_id', $result->id)->value('number');
                abort_if($existing !== null, 409, "توجد مشكلة مرتبطة بهذه النتيجة: #$existing.");
                $issue->step_result_id = $result->id;
                $issue->test_run_id = $result->test_run_id;
                $issue->test_case_id = DB::table('run_cases')->where('id', $result->run_case_id)->value('test_case_id');
                $issue->environment_id = $result->environment_id;
                $issue->environment_snapshot = json_decode($result->environment_snapshot, true);
                $issue->build_version = $data['build_version'] ?? $result->run_build;
            } elseif (! empty($data['environment_id'])) {
                $environment = $project->environments()->where('archived', false)->findOrFail($data['environment_id']);
                $issue->environment_id = $environment->id;
                $issue->environment_snapshot = $environment->only(['id', 'name', 'url']);
            }
            $issue->number = (int) Issue::where('project_id', $project->id)->max('number') + 1;
            $issue->save();
            $this->activity($issue, $actor, 'created', ['status' => 'new', 'step_result_id' => $issue->step_result_id]);
            $this->audit->audit($project, $actor, 'issue.created', ['issue_id' => $issue->id, 'number' => $issue->number, 'severity' => $issue->severity]);

            return $issue;
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(Project $project, int $issueId, User $actor, array $data): Issue
    {
        return DB::transaction(function () use ($project, $issueId, $actor, $data) {
            $project = $this->lockProject($project, $actor);
            $issue = $this->lockIssue($project, $issueId, (int) $data['version']);
            abort_unless($this->isManager($project, $actor) || $issue->reporter_id === $actor->id, 403, 'يعدّل المبلّغ أو مدير المشروع بيانات المشكلة فقط.');
            abort_if($issue->status === 'closed', 409, 'أعد فتح المشكلة قبل تعديلها.');
            $fields = collect($data)->only($issue->getFillable())->all();
            $reclassifies = collect(['severity', 'priority'])->contains(fn ($key) => isset($fields[$key]) && $fields[$key] !== $issue->$key);
            abort_if($reclassifies && $issue->status !== 'new' && ! $this->isManager($project, $actor), 403, 'بعد الفرز يغيّر مدير المشروع وحده الخطورة والأولوية.');
            $issue->fill($fields);
            $changed = array_keys($issue->getDirty());
            if ($changed === []) {
                return $issue;
            }
            $before = collect($issue->getOriginal())->only(array_intersect($changed, ['severity', 'priority', 'title', 'build_version']))->all();
            $issue->version++;
            $issue->save();
            $this->activity($issue, $actor, 'updated', ['fields' => $changed, 'before' => $before, 'after' => collect($fields)->only(array_keys($before))->all()]);
            $this->audit->audit($project, $actor, 'issue.updated', ['issue_id' => $issue->id, 'fields' => $changed]);

            return $issue;
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function transition(Project $project, int $issueId, User $actor, array $data): Issue
    {
        return DB::transaction(function () use ($project, $issueId, $actor, $data) {
            $project = $this->lockProject($project, $actor);
            $issue = $this->lockIssue($project, $issueId, (int) $data['version']);
            $from = $issue->status;
            $to = $data['to'];
            abort_unless(IssueWorkflow::exists($from, $to), 422, 'هذا الانتقال غير مسموح في سير عمل المشكلات.');
            $manager = $this->isManager($project, $actor);
            $assignee = $issue->assignee_id !== null && $issue->assignee_id === $actor->id;
            abort_unless(in_array($to, IssueWorkflow::allowed($from, $manager, $assignee), true), 403, 'لا تملك صلاحية هذا الانتقال.');
            $note = trim((string) ($data['note'] ?? ''));
            if (in_array($to, ['ready_for_retest', 'wont_fix', 'deferred', 'duplicate', 'reopened'], true) && mb_strlen($note) < 3) {
                throw ValidationException::withMessages(['note' => 'اكتب سببًا أو وصفًا للإصلاح.']);
            }
            $metadata = ['from' => $from, 'to' => $to, 'note' => $note ?: null];
            if ($to === 'assigned') {
                if (empty($data['assignee_id'])) {
                    throw ValidationException::withMessages(['assignee_id' => 'اختر المكلَّف بالإصلاح.']);
                }
                $this->assertWorker($project, (int) $data['assignee_id']);
                $metadata['assignee_id'] = (int) $data['assignee_id'];
                $metadata['previous_assignee_id'] = $issue->assignee_id;
                $issue->assignee_id = (int) $data['assignee_id'];
            }
            if ($to === 'duplicate') {
                $original = Issue::where('project_id', $project->id)->find($data['duplicate_of_id'] ?? 0);
                if (! $original || $this->duplicateChainReaches($original, $issue->id)) {
                    throw ValidationException::withMessages(['duplicate_of_id' => 'اختر مشكلة أصلية مختلفة داخل المشروع.']);
                }
                $issue->duplicate_of_id = $original->id;
                $metadata['duplicate_of'] = $original->number;
            } elseif ($from === 'duplicate') {
                $issue->duplicate_of_id = null;
            }
            if ($to === 'ready_for_retest') {
                $metadata['retest_id'] = $this->requestRetest($project, $issue, $actor, $data, $note)->id;
            }
            if ($from === 'ready_for_retest') {
                $cancelled = RetestAttempt::where('issue_id', $issue->id)->where('status', 'pending')->lockForUpdate()->first();
                if ($cancelled) {
                    $cancelled->status = 'cancelled';
                    $cancelled->version++;
                    $cancelled->save();
                    $metadata['cancelled_retest_id'] = $cancelled->id;
                }
            }
            if (in_array($to, ['ready_for_retest', 'wont_fix', 'deferred', 'duplicate'], true)) {
                $issue->resolution = $note;
            } elseif ($to === 'reopened') {
                $issue->resolution = null;
            }
            $issue->closed_at = $to === 'closed' ? now() : null;
            $issue->status = $to;
            $issue->version++;
            $issue->save();
            $this->activity($issue, $actor, 'status_changed', $metadata);
            $this->audit->audit($project, $actor, 'issue.transitioned', ['issue_id' => $issue->id, 'from' => $from, 'to' => $to]);

            return $issue;
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function requestRetest(Project $project, Issue $issue, User $actor, array $data, string $fixNotes): RetestAttempt
    {
        if (empty($data['retest_assignee_id'])) {
            throw ValidationException::withMessages(['retest_assignee_id' => 'اختر المختبر الذي سيعيد الاختبار.']);
        }
        if (empty($data['build_version'])) {
            throw ValidationException::withMessages(['build_version' => 'حدّد إصدار البناء الذي يحتوي الإصلاح.']);
        }
        $tester = (int) $data['retest_assignee_id'];
        $this->assertWorker($project, $tester);
        if ($issue->assignee_id === null) {
            throw ValidationException::withMessages(['retest_assignee_id' => 'أسند المشكلة إلى مكلَّف بالإصلاح قبل طلب إعادة الاختبار.']);
        }
        if ($tester === $issue->assignee_id || $tester === $actor->id) {
            throw ValidationException::withMessages(['retest_assignee_id' => 'يجب أن يتحقق من الإصلاح مختبر مستقل غير المكلَّف بالإصلاح وغير طالب إعادة الاختبار.']);
        }
        $environmentId = $data['environment_id'] ?? $issue->environment_id;
        if ($environmentId) {
            $project->environments()->where('archived', false)->findOrFail($environmentId);
        }
        $step = null;
        if ($issue->step_result_id) {
            $result = DB::table('step_results')->find($issue->step_result_id);
            $snapshot = json_decode(DB::table('run_cases')->where('id', $result->run_case_id)->value('snapshot'), true);
            $found = collect($snapshot['steps'] ?? [])->firstWhere('id', $result->step_key);
            $step = $found ? ['scenario' => $snapshot['title'] ?? null, 'title' => $found['title'], 'expected_result' => $found['expected_result'], 'instructions' => $found['instructions'] ?? ''] : null;
        }
        $attempt = new RetestAttempt;
        $attempt->forceFill([
            'issue_id' => $issue->id, 'project_id' => $project->id,
            'attempt_number' => (int) RetestAttempt::where('issue_id', $issue->id)->max('attempt_number') + 1,
            'assignee_id' => $tester, 'requested_by' => $actor->id, 'environment_id' => $environmentId,
            'build_version' => mb_substr((string) $data['build_version'], 0, 120), 'fix_notes' => $fixNotes,
            'snapshot' => ['title' => $issue->title, 'reproduction_steps' => $issue->reproduction_steps, 'expected_result' => $issue->expected_result, 'original_actual_result' => $issue->actual_result, 'original_build' => $issue->build_version, 'step' => $step],
            'status' => 'pending', 'verified' => false, 'version' => 1,
        ])->save();
        $this->activity($issue, $actor, 'retest_requested', ['retest_id' => $attempt->id, 'attempt' => $attempt->attempt_number, 'assignee_id' => $tester, 'build_version' => $attempt->build_version]);

        return $attempt;
    }

    /**
     * Follows the duplicate_of chain from $start; true when it reaches $issueId (a cycle).
     */
    private function duplicateChainReaches(Issue $start, int $issueId): bool
    {
        $current = $start;
        for ($hops = 0; $current && $hops < 100; $hops++) {
            if ($current->id === $issueId) {
                return true;
            }
            $current = $current->duplicate_of_id ? Issue::find($current->duplicate_of_id) : null;
        }

        return $current !== null;
    }

    public function comment(Project $project, int $issueId, User $actor, string $body): void
    {
        DB::transaction(function () use ($project, $issueId, $actor, $body) {
            $project = $this->lockProject($project, $actor);
            $issue = Issue::where('project_id', $project->id)->lockForUpdate()->findOrFail($issueId);
            $id = DB::table('issue_comments')->insertGetId(['issue_id' => $issue->id, 'author_id' => $actor->id, 'body' => $body, 'created_at' => now()]);
            $this->activity($issue, $actor, 'commented', ['comment_id' => $id]);
            $this->audit->audit($project, $actor, 'issue.commented', ['issue_id' => $issue->id, 'comment_id' => $id]);
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function recordRetest(Project $project, int $attemptId, User $actor, array $data): Issue
    {
        return DB::transaction(function () use ($project, $attemptId, $actor, $data) {
            $project = $this->lockProject($project, $actor);
            $attempt = RetestAttempt::where('project_id', $project->id)->lockForUpdate()->findOrFail($attemptId);
            $issue = Issue::where('project_id', $project->id)->lockForUpdate()->findOrFail($attempt->issue_id);
            abort_unless($attempt->assignee_id === $actor->id, 403, 'يسجّل نتيجة إعادة الاختبار المختبرُ المكلَّف بها فقط.');
            abort_unless($attempt->status === 'pending' && $issue->status === 'ready_for_retest', 409, 'محاولة إعادة الاختبار هذه لم تعد مفتوحة.');
            abort_if($attempt->version !== (int) $data['version'], 409, 'تغيرت محاولة إعادة الاختبار. حدّث الصفحة.');
            if ($data['status'] === 'passed' && ! $data['verified']) {
                throw ValidationException::withMessages(['verified' => 'أكد أنك نفّذت خطوات إعادة الإنتاج وتحققت من النتيجة المتوقعة.']);
            }
            $attempt->forceFill(['status' => $data['status'], 'actual_result' => $data['actual_result'], 'notes' => $data['notes'] ?? null, 'verified' => (bool) $data['verified'], 'executed_at' => now(), 'version' => $attempt->version + 1])->save();
            $from = $issue->status;
            $issue->status = $data['status'] === 'passed' ? 'verified' : 'reopened';
            $issue->version++;
            $issue->save();
            $this->activity($issue, $actor, 'retest_recorded', ['retest_id' => $attempt->id, 'attempt' => $attempt->attempt_number, 'result' => $data['status']]);
            $this->activity($issue, $actor, 'status_changed', ['from' => $from, 'to' => $issue->status, 'note' => 'نتيجة إعادة الاختبار #'.$attempt->attempt_number, 'retest_id' => $attempt->id]);
            $this->audit->audit($project, $actor, 'retest.recorded', ['issue_id' => $issue->id, 'retest_id' => $attempt->id, 'result' => $data['status']]);

            return $issue;
        });
    }

    public function reassignRetest(Project $project, int $attemptId, User $actor, int $assigneeId, int $version): void
    {
        DB::transaction(function () use ($project, $attemptId, $actor, $assigneeId, $version) {
            $project = $this->lockProject($project, $actor);
            abort_unless($this->isManager($project, $actor), 403);
            $attempt = RetestAttempt::where('project_id', $project->id)->lockForUpdate()->findOrFail($attemptId);
            $issue = Issue::where('project_id', $project->id)->lockForUpdate()->findOrFail($attempt->issue_id);
            abort_unless($attempt->status === 'pending', 409, 'لا يمكن إعادة تعيين محاولة مكتملة.');
            abort_if($attempt->version !== $version, 409, 'تغيرت محاولة إعادة الاختبار. حدّث الصفحة.');
            $this->assertWorker($project, $assigneeId);
            if ($assigneeId === $issue->assignee_id || $assigneeId === $attempt->requested_by) {
                throw ValidationException::withMessages(['assignee_id' => 'يجب أن يتحقق من الإصلاح مختبر غير المكلَّف بالإصلاح.']);
            }
            $previous = $attempt->assignee_id;
            $attempt->forceFill(['assignee_id' => $assigneeId, 'version' => $attempt->version + 1])->save();
            $this->activity($issue, $actor, 'retest_reassigned', ['retest_id' => $attempt->id, 'from' => $previous, 'to' => $assigneeId]);
            $this->audit->audit($project, $actor, 'retest.reassigned', ['issue_id' => $issue->id, 'retest_id' => $attempt->id]);
        });
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    public function list(Project $project, array $filters): LengthAwarePaginator
    {
        $query = DB::table('issues')
            ->leftJoin('users as assignee', 'assignee.id', '=', 'issues.assignee_id')
            ->join('users as reporter', 'reporter.id', '=', 'issues.reporter_id')
            ->where('issues.project_id', $project->id)
            ->select(['issues.id', 'issues.number', 'issues.title', 'issues.status', 'issues.severity', 'issues.priority', 'issues.assignee_id', 'issues.reporter_id', 'issues.test_run_id', 'issues.build_version', 'issues.environment_snapshot', 'issues.created_at', 'issues.updated_at', 'assignee.name as assignee_name', 'reporter.name as reporter_name'])
            ->selectSub(DB::table('evidence_files')->whereColumn('evidence_files.issue_id', 'issues.id')->selectRaw('count(*)'), 'evidence_count')
            ->selectSub(DB::table('retest_attempts')->whereColumn('retest_attempts.issue_id', 'issues.id')->selectRaw('count(*)'), 'retest_count');
        if (! empty($filters['status'])) {
            $filters['status'] === 'open' ? $query->whereIn('issues.status', IssueWorkflow::OPEN) : $query->where('issues.status', $filters['status']);
        }
        foreach (['severity', 'priority', 'assignee_id', 'reporter_id', 'test_run_id'] as $field) {
            if (! empty($filters[$field])) {
                $query->where("issues.$field", $filters[$field]);
            }
        }
        if (! empty($filters['search'])) {
            $term = trim($filters['search']);
            $query->where(function ($q) use ($term) {
                $like = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], mb_strtolower($term)).'%';
                $q->whereRaw('lower(issues.title) like ?', [$like])->orWhereRaw('lower(issues.description) like ?', [$like]);
                if (preg_match('/^#?(\d{1,9})$/', $term, $m)) {
                    $q->orWhere('issues.number', (int) $m[1]);
                }
            });
        }
        $sort = $filters['sort'] ?? 'newest';
        match ($sort) {
            'severity' => $query->orderByRaw("case issues.severity when 'blocker' then 0 when 'critical' then 1 when 'major' then 2 when 'minor' then 3 else 4 end")->orderByDesc('issues.id'),
            'updated' => $query->orderByDesc('issues.updated_at')->orderByDesc('issues.id'),
            default => $query->orderByDesc('issues.id'),
        };

        return $query->paginate(25)->through(function ($row) {
            $row->environment_snapshot = $row->environment_snapshot ? json_decode($row->environment_snapshot, true) : null;

            return $row;
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function summary(Project $project, User $actor): array
    {
        $base = DB::table('issues')->where('project_id', $project->id);
        $byStatus = (clone $base)->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status')->map(fn ($v) => (int) $v);
        $openBySeverity = (clone $base)->whereIn('status', IssueWorkflow::OPEN)->selectRaw('severity, count(*) as total')->groupBy('severity')->pluck('total', 'severity')->map(fn ($v) => (int) $v);

        return [
            'total' => (int) $byStatus->sum(),
            'open' => (int) (clone $base)->whereIn('status', IssueWorkflow::OPEN)->count(),
            'critical_open' => (int) (clone $base)->whereIn('status', IssueWorkflow::OPEN)->whereIn('severity', ['blocker', 'critical'])->count(),
            'ready_for_retest' => (int) ($byStatus['ready_for_retest'] ?? 0),
            'assigned_to_me' => (int) (clone $base)->whereIn('status', IssueWorkflow::OPEN)->where('assignee_id', $actor->id)->count(),
            'my_pending_retests' => (int) DB::table('retest_attempts')->where('project_id', $project->id)->where('assignee_id', $actor->id)->where('status', 'pending')->count(),
            'by_status' => $byStatus,
            'open_by_severity' => $openBySeverity,
            'retests' => DB::table('retest_attempts')->where('project_id', $project->id)->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status')->map(fn ($v) => (int) $v),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function detail(Project $project, Issue $issue, User $actor): array
    {
        $names = fn (array $ids) => DB::table('users')->whereIn('id', array_filter($ids))->pluck('name', 'id');
        $manager = $this->isManager($project, $actor);
        $worker = in_array($this->role($project, $actor), ['owner', 'manager', 'tester'], true) && $project->status !== 'archived';
        $assignee = $issue->assignee_id !== null && $issue->assignee_id === $actor->id;
        $comments = DB::table('issue_comments')->join('users', 'users.id', '=', 'issue_comments.author_id')->where('issue_id', $issue->id)->orderBy('issue_comments.id')->get(['issue_comments.id', 'issue_comments.body', 'issue_comments.created_at', 'issue_comments.author_id', 'users.name as author']);
        $activities = DB::table('issue_activities')->join('users', 'users.id', '=', 'issue_activities.actor_id')->where('issue_id', $issue->id)->orderBy('issue_activities.id')->get(['issue_activities.id', 'issue_activities.event', 'issue_activities.metadata', 'issue_activities.created_at', 'users.name as actor'])->map(function ($row) {
            $row->metadata = json_decode($row->metadata, true);

            return $row;
        });
        $retests = DB::table('retest_attempts')->join('users as tester', 'tester.id', '=', 'retest_attempts.assignee_id')->join('users as requester', 'requester.id', '=', 'retest_attempts.requested_by')
            ->where('issue_id', $issue->id)->orderBy('attempt_number')->get(['retest_attempts.*', 'tester.name as assignee_name', 'requester.name as requester_name'])
            ->map(function ($row) use ($project) {
                $row->snapshot = json_decode($row->snapshot, true);
                $row->verified = (bool) $row->verified;
                $row->evidence = $this->evidence->present($project->id, retestId: $row->id);

                return $row;
            });
        $run = $issue->test_run_id ? DB::table('test_runs')->where('id', $issue->test_run_id)->first(['id', 'title', 'status', 'outcome', 'build_version']) : null;
        $case = $issue->test_case_id ? DB::table('test_cases')->where('id', $issue->test_case_id)->first(['id', 'title', 'uid']) : null;
        $step = null;
        if ($issue->step_result_id) {
            $result = DB::table('step_results')->join('run_participants', 'run_participants.id', '=', 'step_results.participant_id')->join('users', 'users.id', '=', 'run_participants.user_id')->where('step_results.id', $issue->step_result_id)->first(['step_results.*', 'run_participants.role as tester_role', 'run_participants.user_id as tester_id', 'users.name as tester_name']);
            $snapshot = json_decode(DB::table('run_cases')->where('id', $result->run_case_id)->value('snapshot'), true);
            $definition = collect($snapshot['steps'] ?? [])->firstWhere('id', $result->step_key);
            $step = ['result_id' => $result->id, 'status' => $result->status, 'tester_role' => $result->tester_role, 'tester_id' => $result->tester_id, 'tester_name' => $result->tester_name, 'title' => $definition['title'] ?? null, 'expected_result' => $definition['expected_result'] ?? null, 'scenario_title' => $snapshot['title'] ?? null, 'scenario_version' => $snapshot['version'] ?? null, 'evidence' => $this->evidence->present($project->id, stepResultId: $result->id)];
        }
        $userNames = $names([$issue->reporter_id, $issue->assignee_id]);
        $duplicateOf = $issue->duplicate_of_id ? Issue::find($issue->duplicate_of_id, ['id', 'number', 'title']) : null;
        $transitions = $worker ? IssueWorkflow::allowed($issue->status, $manager, $assignee) : [];

        return [
            ...$issue->toArray(),
            'reporter_name' => $userNames[$issue->reporter_id] ?? null,
            'assignee_name' => $issue->assignee_id ? ($userNames[$issue->assignee_id] ?? null) : null,
            'duplicate_of' => $duplicateOf,
            'run' => $run, 'scenario' => $case, 'step' => $step,
            'comments' => $comments, 'activities' => $activities, 'retests' => $retests,
            'evidence' => $this->evidence->present($project->id, issueId: $issue->id),
            'permissions' => [
                'transitions' => $transitions,
                'edit' => $worker && ($manager || $issue->reporter_id === $actor->id) && $issue->status !== 'closed',
                'comment' => $worker,
                'upload' => $worker,
                'manage' => $worker && $manager,
            ],
        ];
    }
}
