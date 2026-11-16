<?php

namespace App\Http\Controllers;

use App\Http\Requests\ProjectRequest;
use App\Http\Resources\ProjectResource;
use App\Models\Project;
use App\Models\User;
use App\Services\Accounts\MembershipService;
use App\Services\ProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ProjectController extends Controller
{
    public function __construct(private ProjectService $service, private MembershipService $memberships) {}

    public function index(Request $request)
    {
        $filters = $request->validate(['search' => 'nullable|string|max:120', 'status' => ['nullable', Rule::in(['active', 'archived'])]]);
        $like = isset($filters['search']) ? '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], mb_strtolower(trim($filters['search']))).'%' : null;
        $page = $request->user()->projects()->withCount('members')
            ->when($filters['status'] ?? null, fn ($q, $status) => $q->where('projects.status', $status))
            ->when($like, fn ($q) => $q->where(fn ($w) => $w->whereRaw('lower(projects.name) like ?', [$like])->orWhereRaw('lower(coalesce(projects.description, \'\')) like ?', [$like])))
            ->latest('projects.id')->paginate(20);
        $stats = $this->service->stats($page->getCollection()->pluck('id')->all());
        $page->getCollection()->each(fn ($project) => $project->setAttribute('stats', $stats[$project->id]));

        return ProjectResource::collection($page);
    }

    public function store(ProjectRequest $request)
    {
        return (new ProjectResource($this->service->create($request->user(), $request->validated())))->response()->setStatusCode(201);
    }

    public function show(Project $project)
    {
        Gate::authorize('view', $project);
        $project->load(['members', 'environments'])->setAttribute('stats', $this->service->stats([$project->id])[$project->id]);

        return new ProjectResource($project);
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

    /**
     * Changes the role of an existing member, or (platform admins only) adds an
     * existing active account directly. Everyone else adds people through
     * invitations, so this endpoint never reveals whether an account exists.
     */
    public function member(Request $request, Project $project)
    {
        Gate::authorize('view', $project);
        $actor = $request->user();
        abort_unless($this->memberships->canManage($actor, $project), 403);
        $data = $request->validate(['email' => ['required', 'email', 'max:255'], 'role' => ['required', Rule::in(MembershipService::ROLES)]]);
        $email = strtolower($data['email']);
        $user = User::whereRaw('lower(email) = ?', [$email])->first();
        $isMember = $user && $project->members()->where('users.id', $user->id)->exists();
        if (! $isMember && ! $actor->isPlatformAdmin()) {
            throw ValidationException::withMessages(['email' => 'لإضافة عضو جديد أرسل له دعوة من «إضافة عضو». تعديل الدور متاح للأعضاء الحاليين فقط.']);
        }
        if (! $user) {
            throw ValidationException::withMessages(['email' => 'لا يوجد حساب بهذا البريد. أرسل دعوة أو أنشئ حسابًا من إدارة المستخدمين.']);
        }
        $this->memberships->upsert($project, $actor, $user, $data['role']);

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
        $this->memberships->remove($project, $request->user(), $member);

        return response()->noContent();
    }

    public function dashboard(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->service->dashboard($request->user())])
            ->header('Cache-Control', 'no-store');
    }
}
