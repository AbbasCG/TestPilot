<?php

namespace App\Http\Controllers;

use App\Http\Requests\ScenarioRequest;
use App\Http\Resources\ScenarioResource;
use App\Models\Project;
use App\Models\TestCase;
use App\Models\TestSuite;
use App\Services\ProjectService;
use App\Services\ScenarioService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class ScenarioController extends Controller
{
    public function __construct(private ScenarioService $service, private ProjectService $audit) {}

    public function suites(Project $project): JsonResponse
    {
        Gate::authorize('view', $project);

        return response()->json(['data' => TestSuite::where('project_id', $project->id)->withCount(['cases', 'cases as ready_count' => fn ($q) => $q->where('status', 'ready')])->orderBy('position')->orderBy('id')->get()]);
    }

    public function saveSuite(Request $request, Project $project, ?int $suite = null): JsonResponse
    {
        Gate::authorize('view', $project);
        Gate::authorize('designTests', $project);
        $data = $request->validate(['name' => 'required|string|max:160', 'description' => 'nullable|string|max:5000', 'position' => 'required|integer|min:0|max:100000', 'archived' => 'required|boolean', 'version' => ($suite ? 'required' : 'sometimes').'|integer|min:1']);

        return DB::transaction(function () use ($project, $request, $data, $suite) {
            Project::whereKey($project->id)->lockForUpdate()->firstOrFail();
            $model = $suite ? TestSuite::where('project_id', $project->id)->lockForUpdate()->findOrFail($suite) : new TestSuite;
            if ($suite) {
                abort_if($model->version !== (int) $data['version'], 409, 'حدّث المجموعة قبل الحفظ.');
            }
            $model->fill($data);
            $model->project_id = $project->id;
            $model->version = $suite ? $model->version + 1 : 1;
            $model->save();
            $this->audit->audit($project, $request->user(), 'suite.saved', ['suite_id' => $model->id]);

            return response()->json(['data' => $model], $suite ? 200 : 201);
        });
    }

    public function index(Request $request, Project $project): AnonymousResourceCollection
    {
        Gate::authorize('view', $project);
        $filters = $request->validate(['suite_id' => 'nullable|integer']);

        return ScenarioResource::collection(TestCase::where('project_id', $project->id)->when($filters['suite_id'] ?? null, fn ($q, $id) => $q->where('suite_id', $id))->latest('id')->paginate(50));
    }

    public function show(Project $project, int $scenario): ScenarioResource
    {
        Gate::authorize('view', $project);

        return new ScenarioResource(TestCase::where('project_id', $project->id)->findOrFail($scenario));
    }

    public function store(ScenarioRequest $request, Project $project): JsonResponse
    {
        return (new ScenarioResource($this->service->save($project, $request->user(), $request->validated())))->response()->setStatusCode(201);
    }

    public function update(ScenarioRequest $request, Project $project, int $scenario): ScenarioResource
    {
        $model = TestCase::where('project_id', $project->id)->findOrFail($scenario);

        return new ScenarioResource($this->service->save($project, $request->user(), $request->validated(), $model));
    }

    public function revisions(Project $project, int $scenario): JsonResponse
    {
        Gate::authorize('view', $project);
        $model = TestCase::where('project_id', $project->id)->findOrFail($scenario);

        return response()->json(['data' => $model->revisions()->orderByDesc('version')->get()]);
    }

    public function templates(Project $project): JsonResponse
    {
        Gate::authorize('view', $project);

        return response()->json(['data' => config('scenario_templates')]);
    }

    public function options(Project $project): JsonResponse
    {
        Gate::authorize('view', $project);

        return response()->json(['data' => TestCase::where('project_id', $project->id)->orderBy('title')->get(['id', 'title', 'status', 'suite_id'])]);
    }
}
