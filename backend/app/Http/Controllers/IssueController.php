<?php

namespace App\Http\Controllers;

use App\Models\Issue;
use App\Models\Project;
use App\Services\EvidenceService;
use App\Services\IssueService;
use App\Services\IssueWorkflow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class IssueController extends Controller
{
    public function __construct(private IssueService $service, private EvidenceService $evidence) {}

    private function scoped(Project $project, int $issue): Issue
    {
        Gate::authorize('view', $project);

        return Issue::where('project_id', $project->id)->findOrFail($issue);
    }

    private function writer(Project $project): void
    {
        Gate::authorize('view', $project);
        Gate::authorize('designTests', $project);
    }

    public function index(Request $request, Project $project): JsonResponse
    {
        Gate::authorize('view', $project);
        $filters = $request->validate([
            'status' => ['nullable', Rule::in([...IssueWorkflow::STATUSES, 'open'])],
            'severity' => ['nullable', Rule::in(IssueWorkflow::SEVERITIES)],
            'priority' => ['nullable', Rule::in(IssueWorkflow::PRIORITIES)],
            'assignee_id' => 'nullable|integer', 'reporter_id' => 'nullable|integer', 'test_run_id' => 'nullable|integer',
            'search' => 'nullable|string|max:120', 'sort' => ['nullable', Rule::in(['newest', 'updated', 'severity'])],
        ]);

        return response()->json($this->service->list($project, $filters));
    }

    public function summary(Request $request, Project $project): JsonResponse
    {
        Gate::authorize('view', $project);

        return response()->json(['data' => $this->service->summary($project, $request->user())]);
    }

    /**
     * @return array<string, mixed>
     */
    private function fieldRules(bool $creating): array
    {
        $required = $creating ? 'required' : 'sometimes';

        return [
            'title' => "$required|string|min:3|max:200",
            'description' => "$required|string|min:3|max:10000",
            'reproduction_steps' => "$required|string|min:3|max:10000",
            'expected_result' => "$required|string|min:3|max:5000",
            'actual_result' => "$required|string|min:3|max:5000",
            'severity' => [$required, Rule::in(IssueWorkflow::SEVERITIES)],
            'priority' => [$required, Rule::in(IssueWorkflow::PRIORITIES)],
            'build_version' => 'nullable|string|max:120',
        ];
    }

    public function store(Request $request, Project $project): JsonResponse
    {
        $this->writer($project);
        $data = $request->validate([
            ...$this->fieldRules(true),
            'step_result_id' => 'nullable|integer',
            'environment_id' => ['nullable', 'integer', Rule::exists('environments', 'id')->where('project_id', $project->id)],
        ]);
        $issue = $this->service->create($project, $request->user(), $data);

        return response()->json(['data' => $this->service->detail($project, $issue->refresh(), $request->user())], 201);
    }

    public function show(Request $request, Project $project, int $issue): JsonResponse
    {
        return response()->json(['data' => $this->service->detail($project, $this->scoped($project, $issue), $request->user())]);
    }

    public function update(Request $request, Project $project, int $issue): JsonResponse
    {
        $this->writer($project);
        $this->scoped($project, $issue);
        $data = $request->validate([...$this->fieldRules(false), 'version' => 'required|integer|min:1']);
        $model = $this->service->update($project, $issue, $request->user(), $data);

        return response()->json(['data' => $this->service->detail($project, $model->refresh(), $request->user())]);
    }

    public function transition(Request $request, Project $project, int $issue): JsonResponse
    {
        $this->writer($project);
        $this->scoped($project, $issue);
        $data = $request->validate([
            'version' => 'required|integer|min:1',
            'to' => ['required', Rule::in(IssueWorkflow::STATUSES)],
            'note' => 'nullable|string|max:5000',
            'assignee_id' => 'nullable|integer',
            'duplicate_of_id' => 'nullable|integer',
            'retest_assignee_id' => 'nullable|integer',
            'build_version' => 'nullable|string|max:120',
            'environment_id' => 'nullable|integer',
        ]);
        $model = $this->service->transition($project, $issue, $request->user(), $data);

        return response()->json(['data' => $this->service->detail($project, $model->refresh(), $request->user())]);
    }

    public function comment(Request $request, Project $project, int $issue): JsonResponse
    {
        $this->writer($project);
        $model = $this->scoped($project, $issue);
        $data = $request->validate(['body' => 'required|string|min:1|max:5000']);
        $this->service->comment($project, $issue, $request->user(), trim($data['body']));

        return response()->json(['data' => $this->service->detail($project, $model->refresh(), $request->user())], 201);
    }

    public function recordRetest(Request $request, Project $project, int $retest): JsonResponse
    {
        $this->writer($project);
        $data = $request->validate([
            'version' => 'required|integer|min:1',
            'status' => ['required', Rule::in(['passed', 'failed'])],
            'actual_result' => 'required|string|min:3|max:10000',
            'notes' => 'nullable|string|max:10000',
            'verified' => 'required|boolean',
        ]);
        $issue = $this->service->recordRetest($project, $retest, $request->user(), $data);

        return response()->json(['data' => $this->service->detail($project, $issue->refresh(), $request->user())]);
    }

    public function reassignRetest(Request $request, Project $project, int $retest): JsonResponse
    {
        $this->writer($project);
        $data = $request->validate(['version' => 'required|integer|min:1', 'assignee_id' => 'required|integer']);
        $this->service->reassignRetest($project, $retest, $request->user(), $data['assignee_id'], $data['version']);

        return response()->json(null, 204);
    }

    public function myRetests(Request $request, Project $project): JsonResponse
    {
        Gate::authorize('view', $project);

        return response()->json(['data' => DB::table('retest_attempts')->join('issues', 'issues.id', '=', 'retest_attempts.issue_id')
            ->where('retest_attempts.project_id', $project->id)->where('retest_attempts.assignee_id', $request->user()->id)->where('retest_attempts.status', 'pending')
            ->orderBy('retest_attempts.id')->get(['retest_attempts.id', 'retest_attempts.attempt_number', 'retest_attempts.build_version', 'retest_attempts.created_at', 'issues.id as issue_id', 'issues.number', 'issues.title', 'issues.severity'])]);
    }

    public function upload(Request $request, Project $project): JsonResponse
    {
        $this->writer($project);
        $maxKb = (int) ceil(max(config('evidence.limits')) / 1024);
        $data = $request->validate([
            'file' => "required|file|max:$maxKb",
            'kind' => ['required', Rule::in(array_keys(config('evidence.types')))],
            'issue_id' => 'nullable|integer', 'step_result_id' => 'nullable|integer', 'retest_attempt_id' => 'nullable|integer',
        ]);
        $id = $this->evidence->store($project, $request->user(), $request->file('file'), $data['kind'], $data);
        $file = collect($this->evidence->present($project->id, $data['issue_id'] ?? null, $data['step_result_id'] ?? null, $data['retest_attempt_id'] ?? null))->firstWhere('id', $id);

        return response()->json(['data' => $file], 201);
    }

    public function download(Request $request, Project $project, int $evidence): StreamedResponse
    {
        return $this->evidence->download($project, $request->user(), $evidence, $request->boolean('inline'));
    }
}
