<?php

namespace App\Services;

use App\Models\Project;
use App\Models\TestCase;
use App\Models\TestRun;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

class RunService
{
    public function __construct(private ProjectService $audit, private EvidenceService $evidence) {}

    public function create(Project $project, User $actor, array $data): TestRun
    {
        return DB::transaction(function () use ($project, $actor, $data) {
            $project = Project::whereKey($project->id)->lockForUpdate()->firstOrFail();
            Gate::forUser($actor)->authorize('designTests', $project);
            abort_if($project->status === 'archived', 422, 'أعد تفعيل المشروع قبل بدء جلسة.');
            $environment = $project->environments()->where('archived', false)->findOrFail($data['environment_id']);
            $ids = array_column($data['scenarios'], 'id');
            $cases = [];
            $total = 0;
            foreach ($data['scenarios'] as $selection) {
                $case = TestCase::where('project_id', $project->id)->where('status', 'ready')->findOrFail($selection['id']);
                abort_if(isset($data['suite_id']) && $case->suite_id !== (int) $data['suite_id'], 422, 'السيناريو خارج المجموعة المحددة.');
                abort_if($case->version !== (int) $selection['version'], 409, 'تغيرت نسخة سيناريو. حدّث اختيارك.');
                abort_if(DB::table('test_suites')->where('id', $case->suite_id)->value('archived'), 422, 'المجموعة مؤرشفة.');
                $revision = $case->currentRevision();
                abort_if(count(array_diff($revision->content['dependencies'], $ids)) > 0, 422, 'اختر جميع السيناريوهات المعتمَد عليها. استخدم كل المجموعات عند الحاجة.');
                $total += count($revision->content['steps']);
                $cases[] = [$case, $revision];
            }
            abort_if($total > 500, 422, 'الحد الأقصى للجلسة 500 خطوة.');
            $run = new TestRun($data);
            $run->project_id = $project->id;
            $run->created_by = $actor->id;
            $run->environment_id = $environment->id;
            $run->environment_snapshot = $environment->only(['id', 'name', 'url']);
            $run->status = 'active';
            $run->version = 1;
            $run->save();
            $participants = [];
            foreach (['A' => $data['tester_a_id'], 'B' => $data['tester_b_id']] as $role => $userId) {
                abort_unless($project->members()->where('users.id', $userId)->wherePivotIn('role', ['owner', 'manager', 'tester'])->exists(), 422, 'عضوية المختبر غير صالحة.');
                $participants[$role] = DB::table('run_participants')->insertGetId(['test_run_id' => $run->id, 'user_id' => $userId, 'role' => $role]);
            }
            foreach ($cases as [$case, $revision]) {
                $caseId = DB::table('run_cases')->insertGetId(['test_run_id' => $run->id, 'project_id' => $project->id, 'test_case_id' => $case->id, 'scenario_revision_id' => $revision->id, 'snapshot' => json_encode([...$revision->content, 'version' => $revision->version], JSON_THROW_ON_ERROR)]);
                foreach ($revision->content['steps'] as $step) {
                    $roles = $step['assigned_role'] === 'both' ? ['A', 'B'] : [$step['assigned_role']];
                    foreach ($roles as $role) {
                        DB::table('step_results')->insert(['test_run_id' => $run->id, 'run_case_id' => $caseId, 'participant_id' => $participants[$role], 'step_key' => $step['id'], 'status' => 'pending', 'verified' => false, 'version' => 0, 'created_at' => now(), 'updated_at' => now()]);
                    }
                }
            }
            $this->audit->audit($project, $actor, 'run.created', ['run_id' => $run->id]);

            return $run;
        });
    }

    public function detail(TestRun $run): array
    {
        $participants = DB::table('run_participants')->join('users', 'users.id', '=', 'run_participants.user_id')->where('test_run_id', $run->id)->get(['run_participants.*', 'users.name']);
        $cases = DB::table('run_cases')->where('test_run_id', $run->id)->orderBy('id')->get()->map(function ($case) {
            $case->snapshot = json_decode($case->snapshot, true, flags: JSON_THROW_ON_ERROR);

            return $case;
        });
        $results = DB::table('step_results')->where('test_run_id', $run->id)->orderBy('id')->get()->map(function ($result) {
            $result->verified = (bool) $result->verified;

            return $result;
        });

        $issues = DB::table('issues')->where('test_run_id', $run->id)->whereNotNull('step_result_id')->get(['id', 'number', 'status', 'severity', 'step_result_id']);

        return [...$run->toArray(), 'participants' => $participants, 'cases' => $cases, 'results' => $results, 'issues' => $issues, 'evidence' => $this->evidence->present($run->project_id, runId: $run->id), 'progress' => ['done' => $results->where('status', '!=', 'pending')->count(), 'passed' => $results->where('status', 'passed')->count(), 'total' => $results->count()]];
    }

    public function saveResult(Project $project, TestRun $run, User $actor, int $resultId, array $data): void
    {
        DB::transaction(function () use ($project, $run, $actor, $resultId, $data) {
            Project::whereKey($project->id)->lockForUpdate()->firstOrFail();
            Gate::forUser($actor)->authorize('designTests', $project);
            $run = TestRun::lockForUpdate()->findOrFail($run->id);
            abort_unless($run->status === 'active', 409, 'الجلسة متوقفة أو منتهية.');
            $result = DB::table('step_results')->where('test_run_id', $run->id)->where('id', $resultId)->lockForUpdate()->first();
            abort_unless($result, 404);
            $participant = DB::table('run_participants')->find($result->participant_id);
            abort_unless($participant->user_id === $actor->id, 403, 'يمكنك اعتماد خطواتك فقط.');
            abort_if(DB::table('issues')->where('step_result_id', $resultId)->exists(), 409, 'هذه النتيجة مرتبطة بمشكلة؛ يُتحقق من الإصلاح بإعادة الاختبار ولا تُعدّل النتيجة الأصلية.');
            abort_if($result->version !== (int) $data['version'], 409, 'تغيرت النتيجة. حدّث البيانات قبل الحفظ.');
            $case = DB::table('run_cases')->find($result->run_case_id);
            $snapshot = json_decode($case->snapshot, true, flags: JSON_THROW_ON_ERROR);
            $step = collect($snapshot['steps'])->firstWhere('id', $result->step_key);
            foreach ($snapshot['steps'] as $downstream) {
                if (in_array($step['id'], $downstream['depends_on'], true)) {
                    abort_if(DB::table('step_results')->where('run_case_id', $case->id)->where('step_key', $downstream['id'])->where('status', 'passed')->exists(), 409, 'اعتمدت خطوة لاحقة على هذه النتيجة. أنشئ جلسة إعادة اختبار لتغييرها.');
                }
            }
            if ($data['status'] === 'passed') {
                if (! $data['verified']) {
                    throw ValidationException::withMessages(['verified' => 'أكد مطابقة النتيجة الفعلية للمتوقعة.']);
                }
                foreach ($step['depends_on'] as $dependency) {
                    abort_if(DB::table('step_results')->where('run_case_id', $case->id)->where('step_key', $dependency)->where('status', '!=', 'passed')->exists(), 409, 'انتظر نجاح الخطوات السابقة وتأكيد الطرف الآخر.');
                }
                foreach ($snapshot['dependencies'] as $dependency) {
                    $dependencyCase = DB::table('run_cases')->where('test_run_id', $run->id)->where('test_case_id', $dependency)->first();
                    abort_if(! $dependencyCase || DB::table('step_results')->where('run_case_id', $dependencyCase->id)->where('status', '!=', 'passed')->exists(), 409, 'السيناريو المعتمَد عليه لم يكتمل بنجاح.');
                }
                if ($step['evidence_required'] || $step['type'] === 'capture_evidence') {
                    abort_unless($this->hasEvidence($resultId, $actor->id), 422, 'أرفق دليلًا لهذه الخطوة قبل اعتماد نجاحها.');
                }
            }
            $values = ['status' => $data['status'], 'actual_result' => $data['actual_result'], 'notes' => $data['notes'] ?? null, 'verified' => $data['verified'], 'version' => $result->version + 1, 'updated_at' => now()];
            DB::table('step_results')->where('id', $resultId)->update($values);
            DB::table('result_history')->insert(['step_result_id' => $resultId, 'actor_id' => $actor->id, 'version' => $values['version'], 'content' => json_encode($values, JSON_THROW_ON_ERROR), 'created_at' => now()]);
            $run->increment('version');
            $this->audit->audit($project, $actor, 'result.recorded', ['run_id' => $run->id, 'result_id' => $resultId, 'status' => $data['status']]);
        });
    }

    private function hasEvidence(int $resultId, int $actorId): bool
    {
        return DB::table('evidence_files')->where('step_result_id', $resultId)->where('uploaded_by', $actorId)->exists();
    }

    public function transition(Project $project, TestRun $run, User $actor, array $data): void
    {
        DB::transaction(function () use ($project, $run, $actor, $data) {
            Project::whereKey($project->id)->lockForUpdate()->firstOrFail();
            Gate::forUser($actor)->authorize('designTests', $project);
            $run = TestRun::lockForUpdate()->findOrFail($run->id);
            abort_if($run->version !== (int) $data['version'], 409, 'تغيرت الجلسة. حدّث الصفحة.');
            $manager = $run->created_by === $actor->id || Gate::forUser($actor)->allows('update', $project);
            $participant = DB::table('run_participants')->where('test_run_id', $run->id)->where('user_id', $actor->id)->exists();
            abort_unless($manager || $participant, 403);
            if ($data['action'] === 'pause') {
                abort_unless($run->status === 'active', 409);
                $run->status = 'paused';
            } elseif ($data['action'] === 'resume') {
                abort_unless($run->status === 'paused', 409);
                $run->status = 'active';
            } else {
                abort_unless($manager, 403, 'اعتماد النتيجة النهائية متاح لمنشئ الجلسة ومدير المشروع.');
                abort_unless($run->status === 'active', 409);
                $results = DB::table('step_results')->where('test_run_id', $run->id);
                if ($data['outcome'] === 'passed') {
                    abort_if((clone $results)->where(fn ($q) => $q->where('status', '!=', 'passed')->orWhere('verified', false))->exists(), 422, 'لا يمكن النجاح دون تأكيد جميع النتائج ونقاط التحقق من الطرفين.');
                }
                if ($data['outcome'] === 'failed') {
                    abort_unless((clone $results)->where('status', 'failed')->exists(), 422, 'سجّل خطوة فاشلة أولًا.');
                }
                $run->status = 'completed';
                $run->outcome = $data['outcome'];
                $run->summary = $data['summary'];
                $run->completed_at = now();
            }
            $run->version++;
            $run->save();
            $this->audit->audit($project, $actor, 'run.'.$data['action'], ['run_id' => $run->id, 'outcome' => $run->outcome]);
        });
    }
}
