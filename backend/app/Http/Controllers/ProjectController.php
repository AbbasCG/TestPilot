<?php

namespace App\Http\Controllers;

use App\Http\Requests\ProjectRequest;
use App\Http\Resources\ProjectResource;
use App\Models\Project;
use App\Models\User;
use App\Services\ProjectService;
use Illuminate\Http\Request;
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

    public function dashboard(Request $request)
    {
        return response()->json(['data' => [
            'projects' => $request->user()->projects()->count(),
            'active_projects' => $request->user()->projects()->where('status', 'active')->count(),
            'environments' => DB::table('environments')->whereIn('project_id', $request->user()->projects()->select('projects.id'))->count(),
        ]]);
    }
}
