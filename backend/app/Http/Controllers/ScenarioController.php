<?php

namespace App\Http\Controllers;

use App\Http\Requests\ScenarioRequest;
use App\Http\Resources\ScenarioResource;
use App\Models\Project;
use App\Models\TestCase;
use App\Models\TestSuite;
use App\Services\ProjectService;
use App\Services\Scenarios\ScenarioRules;
use App\Services\ScenarioService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

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
        $filters = $request->validate([
            'suite_id' => 'nullable|integer', 'search' => 'nullable|string|max:120',
            'status' => ['nullable', Rule::in(ScenarioRules::STATUSES)], 'priority' => ['nullable', Rule::in(ScenarioRules::PRIORITIES)],
        ]);
        $like = isset($filters['search']) ? '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], mb_strtolower(trim($filters['search']))).'%' : null;
        $number = isset($filters['search']) && preg_match('/^(?:tc-)?(\d{1,9})$/i', trim($filters['search']), $m) ? (int) $m[1] : null;

        return ScenarioResource::collection(TestCase::where('project_id', $project->id)
            ->when($filters['suite_id'] ?? null, fn ($q, $id) => $q->where('suite_id', $id))
            ->when($filters['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            ->when($filters['priority'] ?? null, fn ($q, $priority) => $q->where('priority', $priority))
            ->when($like, fn ($q) => $q->where(fn ($w) => $w->whereRaw('lower(title) like ?', [$like])->when($number, fn ($x) => $x->orWhere('id', $number))))
            ->latest('id')->paginate(50));
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

        $cases = TestCase::where('project_id', $project->id)->orderBy('title')->get(['id', 'title', 'status', 'suite_id', 'version']);
        $contents = DB::table('scenario_revisions')->join('test_cases', fn ($join) => $join->on('test_cases.id', '=', 'scenario_revisions.test_case_id')->on('test_cases.version', '=', 'scenario_revisions.version'))
            ->where('test_cases.project_id', $project->id)->pluck('scenario_revisions.content', 'test_cases.id');

        return response()->json(['data' => $cases->map(function ($case) use ($contents) {
            $content = json_decode($contents[$case->id] ?? '{}', true) ?: [];
            $reason = ScenarioRules::soloIneligibility($content);

            return [...$case->toArray(), 'steps_count' => count($content['steps'] ?? []), 'solo_eligible' => $reason === null, 'solo_reason' => $reason];
        })]);
    }
}
