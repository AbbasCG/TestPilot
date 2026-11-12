<?php

namespace App\Http\Controllers;

use App\Http\Requests\RunRequest;
use App\Models\Project;
use App\Models\TestRun;
use App\Services\RunService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class RunController extends Controller
{
    public function __construct(private RunService $service) {}

    private function scoped(Project $project, int $run): TestRun
    {
        Gate::authorize('view', $project);

        return TestRun::where('project_id', $project->id)->findOrFail($run);
    }

    public function index(Project $project): JsonResponse
    {
        Gate::authorize('view', $project);

        return response()->json(TestRun::where('project_id', $project->id)->latest('id')->paginate(30));
    }

    public function store(RunRequest $request, Project $project): JsonResponse
    {
        return response()->json(['data' => $this->service->detail($this->service->create($project, $request->user(), $request->validated()))], 201);
    }

    public function show(Project $project, int $run): JsonResponse
    {
        return response()->json(['data' => $this->service->detail($this->scoped($project, $run))]);
    }

    public function result(Request $request, Project $project, int $run, int $result): JsonResponse
    {
        $model = $this->scoped($project, $run);
        $data = $request->validate(['version' => 'required|integer|min:0', 'status' => ['required', Rule::in(['passed', 'failed', 'blocked'])], 'actual_result' => 'required|string|min:3|max:10000', 'notes' => 'nullable|string|max:10000', 'verified' => 'required|boolean']);
        $this->service->saveResult($project, $model, $request->user(), $result, $data);

        return response()->json(['data' => $this->service->detail($model->refresh())]);
    }

    public function transition(Request $request, Project $project, int $run): JsonResponse
    {
        $model = $this->scoped($project, $run);
        $data = $request->validate(['version' => 'required|integer|min:1', 'action' => ['required', Rule::in(['pause', 'resume', 'complete'])], 'outcome' => ['required_if:action,complete', Rule::in(['passed', 'failed', 'inconclusive'])], 'summary' => 'required_if:action,complete|string|min:10|max:10000']);
        $this->service->transition($project, $model, $request->user(), $data);

        return response()->json(['data' => $this->service->detail($model->refresh())]);
    }

    public function history(Project $project, int $run): JsonResponse
    {
        $this->scoped($project, $run);

        return response()->json(['data' => DB::table('result_history')->join('step_results', 'step_results.id', '=', 'result_history.step_result_id')->where('step_results.test_run_id', $run)->orderByDesc('result_history.id')->get(['result_history.*'])->map(function ($entry) {
            $entry->content = json_decode($entry->content, true);

            return $entry;
        })]);
    }
}
