<?php

namespace App\Http\Controllers;

use App\Http\Requests\ProjectRequest;
use App\Http\Resources\ProjectResource;
use App\Models\Project;
use App\Models\User;
use App\Services\ProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class ProjectController extends Controller
{
    public function __construct(private ProjectService $service) {}

    public function index(Request $request)
    {
        return ProjectResource::collection($request->user()->projects()->withCount('members')->latest('projects.id')->paginate(20));
    }

    public function store(ProjectRequest $request)
    {
        return (new ProjectResource($this->service->create($request->user(), $request->validated())))->response()->setStatusCode(201);
    }

    public function show(Project $project)
    {
        Gate::authorize('view', $project);

        return new ProjectResource($project->load(['members', 'environments']));
    }

    public function update(ProjectRequest $request, Project $project)
    {
        Gate::authorize('view', $project);
        Gate::authorize('update', $project);

        return new ProjectResource($this->service->update($project, $request->user(), $request->validated()));
    }

    public function environment(Request $request, Project $project)
    {
        Gate::authorize('view', $project);
        Gate::authorize('update', $project);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80', Rule::unique('environments')->where('project_id', $project->id)],
            'url' => ['nullable', 'url:http,https', 'max:2048'],
        ]);

        return DB::transaction(function () use ($project, $request, $data) {
            $environment = $project->environments()->create($data);
            $this->service->audit($project, $request->user(), 'environment.created', ['environment_id' => $environment->id]);

            return response()->json(['data' => $environment], 201);
        });
    }

    public function member(Request $request, Project $project)
    {
        Gate::authorize('view', $project);
        Gate::authorize('manageMembers', $project);
        $data = $request->validate(['email' => ['required', 'email', 'exists:users,email'], 'role' => ['required', Rule::in(['manager', 'tester', 'viewer'])]]);
        $user = User::where('email', $data['email'])->firstOrFail();
        abort_if($user->id === $project->owner_id, 422, 'لا يمكن تغيير دور المالك.');
        DB::transaction(function () use ($project, $request, $data, $user) {
            Project::whereKey($project->id)->lockForUpdate()->firstOrFail();
            if ($data['role'] === 'viewer') {
                $this->assertNoActiveRun($project, $user->id);
            }
            $project->members()->syncWithoutDetaching([$user->id => ['role' => $data['role']]]);
            $this->service->audit($project, $request->user(), 'member.updated', ['user_id' => $user->id, 'role' => $data['role']]);
        });

        return new ProjectResource($project->load(['members', 'environments']));
    }

    public function activity(Project $project)
    {
        Gate::authorize('view', $project);

        return response()->json(['data' => DB::table('activity_logs')->where('project_id', $project->id)->latest('id')->limit(30)->get()]);
    }

    public function updateEnvironment(Request $request, Project $project, int $environment): JsonResponse
    {
        Gate::authorize('view', $project);
        Gate::authorize('update', $project);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80', Rule::unique('environments')->where('project_id', $project->id)->ignore($environment)],
            'url' => ['nullable', 'url:http,https', 'max:2048'], 'archived' => 'required|boolean', 'version' => 'required|integer|min:1',
        ]);

        return DB::transaction(function () use ($project, $environment, $data, $request) {
            Project::whereKey($project->id)->lockForUpdate()->firstOrFail();
            $model = $project->environments()->lockForUpdate()->findOrFail($environment);
            abort_if($model->version !== (int) $data['version'], 409, 'تم تعديل البيئة. حدّث الصفحة.');
            $model->fill($data);
            $model->archived = $data['archived'];
            $model->version++;
            $model->save();
            $this->service->audit($project, $request->user(), 'environment.updated', ['environment_id' => $model->id]);

            return response()->json(['data' => $model]);
        });
    }

    public function removeMember(Request $request, Project $project, int $member): Response
    {
        Gate::authorize('view', $project);
        Gate::authorize('manageMembers', $project);
        abort_if($member === $project->owner_id, 422, 'لا يمكن إزالة مالك المشروع.');
        DB::transaction(function () use ($project, $member, $request) {
            Project::whereKey($project->id)->lockForUpdate()->firstOrFail();
            abort_unless($project->members()->where('users.id', $member)->exists(), 404);
            $this->assertNoActiveRun($project, $member);
            $project->members()->detach($member);
            $this->service->audit($project, $request->user(), 'member.removed', ['user_id' => $member]);
        });

        return response()->noContent();
    }

    public function dashboard(Request $request)
    {
        return response()->json(['data' => [
            'projects' => $request->user()->projects()->count(),
            'active_projects' => $request->user()->projects()->where('status', 'active')->count(),
            'environments' => DB::table('environments')->whereIn('project_id', $request->user()->projects()->select('projects.id'))->count(),
        ]]);
    }

    private function assertNoActiveRun(Project $project, int $userId): void
    {
        abort_if(DB::table('run_participants')->join('test_runs', 'test_runs.id', '=', 'run_participants.test_run_id')
            ->where('test_runs.project_id', $project->id)->where('run_participants.user_id', $userId)
            ->whereIn('test_runs.status', ['active', 'paused'])->exists(), 422, 'المختبر مشارك في جلسة نشطة. أنهِ الجلسة قبل تغيير وصوله.');
    }
}
