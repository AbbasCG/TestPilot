<?php

namespace App\Http\Controllers;

use App\Models\Invitation;
use App\Models\Project;
use App\Models\User;
use App\Services\Accounts\AccountService;
use App\Services\Accounts\InvitationService;
use App\Services\Accounts\MembershipService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Platform users console (platform owners and admins only, enforced by the
 * can:manageUsers route middleware and again in the services). Responses never
 * include password hashes, remember tokens, invitation tokens or token hashes.
 */
class AdminUserController extends Controller
{
    public function __construct(private AccountService $accounts, private InvitationService $invitations, private MembershipService $memberships) {}

    /**
     * @return array<string, mixed>
     */
    private function summary(User $user): array
    {
        return [
            'id' => $user->id, 'name' => $user->name, 'email' => $user->email,
            'platform_role' => $user->platform_role, 'status' => $user->status, 'state' => $user->accountState(),
            'must_change_password' => (bool) $user->must_change_password, 'last_login_at' => $user->last_login_at,
            'password_changed_at' => $user->password_changed_at, 'created_at' => $user->created_at, 'version' => $user->version,
        ];
    }

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'search' => 'nullable|string|max:120',
            'state' => ['nullable', Rule::in(['active', 'must_change_password', 'suspended', 'disabled'])],
            'platform_role' => ['nullable', Rule::in(['owner', 'admin', 'none'])],
            'project_id' => 'nullable|integer',
            'sort' => ['nullable', Rule::in(['name', 'created_at', 'last_login_at'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
        ]);
        $query = User::query()->withCount('projects');
        if (! empty($filters['search'])) {
            $like = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], mb_strtolower(trim($filters['search']))).'%';
            $query->where(fn ($q) => $q->whereRaw('lower(name) like ?', [$like])->orWhereRaw('lower(email) like ?', [$like]));
        }
        match ($filters['state'] ?? null) {
            'active' => $query->where('status', 'active')->where('must_change_password', false),
            'must_change_password' => $query->where('status', 'active')->where('must_change_password', true),
            'suspended', 'disabled' => $query->where('status', $filters['state']),
            default => null,
        };
        match ($filters['platform_role'] ?? null) {
            'none' => $query->whereNull('platform_role'),
            'owner', 'admin' => $query->where('platform_role', $filters['platform_role']),
            default => null,
        };
        if (! empty($filters['project_id'])) {
            $query->whereHas('projects', fn ($q) => $q->where('projects.id', $filters['project_id']));
        }
        $sort = $filters['sort'] ?? 'created_at';
        $direction = $filters['direction'] ?? ($sort === 'name' ? 'asc' : 'desc');
        $query->orderByRaw($sort === 'last_login_at' ? "last_login_at $direction nulls last" : "$sort $direction")->orderBy('id');
        $page = $query->paginate(25)->through(fn (User $u) => [...$this->summary($u), 'projects_count' => $u->projects_count]);

        return response()->json([...$page->toArray(), 'summary' => [
            'total' => User::count(),
            'active' => User::where('status', 'active')->where('must_change_password', false)->count(),
            'must_change_password' => User::where('status', 'active')->where('must_change_password', true)->count(),
            'inactive' => User::whereIn('status', ['suspended', 'disabled'])->count(),
            'pending_invitations' => Invitation::where('status', 'pending')->where('expires_at', '>', now())->count(),
        ]]);
    }

    public function show(int $user): JsonResponse
    {
        $model = User::findOrFail($user);
        $projects = DB::table('project_members')->join('projects', 'projects.id', '=', 'project_members.project_id')
            ->where('project_members.user_id', $model->id)->orderBy('projects.name')
            ->get(['projects.id', 'projects.name', 'projects.status', 'project_members.role', 'project_members.created_at as joined_at']);
        $activity = DB::table('account_activities')->leftJoin('users as actor', 'actor.id', '=', 'account_activities.actor_id')
            ->leftJoin('projects', 'projects.id', '=', 'account_activities.project_id')
            ->where('account_activities.user_id', $model->id)->orderByDesc('account_activities.id')->limit(100)
            ->get(['account_activities.id', 'account_activities.action', 'account_activities.metadata', 'account_activities.created_at', 'actor.name as actor', 'projects.name as project'])
            ->map(function ($row) {
                $row->metadata = json_decode($row->metadata, true);

                return $row;
            });
        $invitations = Invitation::where('email', strtolower($model->email))->latest('id')->limit(20)->get()->map(fn ($i) => InvitationController::present($i));

        return response()->json(['data' => [
            ...$this->summary($model),
            'status_reason' => $model->isActive() ? null : $model->status_reason,
            'status_changed_at' => $model->status_changed_at,
            'created_by' => $model->created_by ? User::find($model->created_by)?->only(['id', 'name']) : null,
            'projects' => $projects, 'activity' => $activity, 'invitations' => $invitations,
        ]]);
    }

    /** Admin-only e-mail lookup used by the create wizard. */
    public function lookup(Request $request): JsonResponse
    {
        $email = strtolower($request->validate(['email' => ['required', 'email', 'max:255']])['email']);
        $user = User::whereRaw('lower(email) = ?', [$email])->first();
        $pending = Invitation::where('email', $email)->where('status', 'pending')->where('expires_at', '>', now())->get()->map(fn ($i) => InvitationController::present($i));

        return response()->json(['data' => ['user' => $user ? $this->summary($user) : null, 'pending_invitations' => $pending]]);
    }

    public function store(Request $request): JsonResponse
    {
        $actor = $request->user();
        $data = $request->validate([
            'name' => ['required_if:method,temporary_password', 'nullable', 'string', 'min:2', 'max:120'],
            'email' => ['required', 'email', 'max:255'],
            'method' => ['required', Rule::in(['invitation', 'temporary_password'])],
            'platform_role' => ['nullable', Rule::in(['owner', 'admin'])],
            'project_id' => ['nullable', 'integer', 'exists:projects,id', 'required_if:method,invitation'],
            'project_role' => ['nullable', 'required_with:project_id', Rule::in(MembershipService::ROLES)],
            'password_mode' => ['required_if:method,temporary_password', 'nullable', Rule::in(['generate', 'manual'])],
            'temporary_password' => ['required_if:password_mode,manual', 'nullable', 'string', AccountService::passwordRule()],
        ]);
        abort_if(! empty($data['platform_role']) && ! $actor->isPlatformOwner(), 403, 'يمنح مالك المنصة وحده صلاحيات المنصة.');
        $existing = User::whereRaw('lower(email) = ?', [strtolower($data['email'])])->first();
        if ($existing) {
            return response()->json(['message' => 'يوجد حساب بهذا البريد بالفعل. يمكنك إضافته إلى مشروع من صفحته.', 'code' => 'account_exists', 'user' => $this->summary($existing)], 409);
        }
        $project = ! empty($data['project_id']) ? Project::findOrFail($data['project_id']) : null;
        if ($data['method'] === 'invitation') {
            abort_if(! empty($data['platform_role']), 422, 'تُمنح صلاحيات المنصة بعد قبول الدعوة من صفحة المستخدم.');
            [$invitation, $token] = $this->invitations->create($actor, $data['email'], $project, $data['project_role'] ?? null);

            return response()->json(['data' => ['method' => 'invitation', ...InvitationController::delivery($invitation, $token)]], 201);
        }
        $manual = $data['password_mode'] === 'manual' ? $data['temporary_password'] : null;
        [$user, $generated] = $this->accounts->createWithTemporaryPassword($actor, $data, $manual);
        if ($project) {
            $this->memberships->upsert($project, $actor, $user, $data['project_role'], via: 'account_creation');
        }

        // The generated password is returned exactly once and is never stored in plain text or logged.
        return response()->json(['data' => ['method' => 'temporary_password', 'user' => $this->summary($user), 'temporary_password' => $generated]], 201);
    }

    public function update(Request $request, int $user): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'min:2', 'max:120'], 'version' => ['required', 'integer', 'min:1']]);

        return response()->json(['data' => $this->summary($this->accounts->updateProfile($request->user(), User::findOrFail($user), $data['name'], $data['version']))]);
    }

    public function platformRole(Request $request, int $user): JsonResponse
    {
        $data = $request->validate(['platform_role' => ['nullable', Rule::in(['owner', 'admin'])]]);

        return response()->json(['data' => $this->summary($this->accounts->setPlatformRole($request->user(), User::findOrFail($user), $data['platform_role'] ?? null))]);
    }

    public function status(Request $request, int $user): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(['active', 'suspended', 'disabled'])],
            'reason' => ['required_unless:status,active', 'nullable', 'string', 'min:3', 'max:1000'],
        ]);

        return response()->json(['data' => $this->summary($this->accounts->setStatus($request->user(), User::findOrFail($user), $data['status'], $data['reason'] ?? null))]);
    }

    public function temporaryPassword(Request $request, int $user): JsonResponse
    {
        $data = $request->validate([
            'password_mode' => ['required', Rule::in(['generate', 'manual'])],
            'temporary_password' => ['required_if:password_mode,manual', 'nullable', 'string', AccountService::passwordRule()],
        ]);
        $generated = $this->accounts->resetToTemporaryPassword($request->user(), User::findOrFail($user), $data['password_mode'] === 'manual' ? $data['temporary_password'] : null);

        return response()->json(['data' => ['temporary_password' => $generated]]);
    }

    public function membership(Request $request, int $user): JsonResponse
    {
        $data = $request->validate(['project_id' => ['required', 'integer'], 'role' => ['required', Rule::in(MembershipService::ROLES)]]);
        $target = User::findOrFail($user);
        $this->accounts->assertCanManage($request->user(), $target);
        $this->memberships->upsert(Project::findOrFail($data['project_id']), $request->user(), $target, $data['role'], via: 'users_console');

        return $this->show($target->id);
    }

    public function removeMembership(Request $request, int $user, int $project): Response
    {
        $target = User::findOrFail($user);
        $this->accounts->assertCanManage($request->user(), $target);
        $this->memberships->remove(Project::findOrFail($project), $request->user(), $target->id);

        return response()->noContent();
    }

    public function projects(): JsonResponse
    {
        return response()->json(['data' => Project::orderBy('name')->get(['id', 'name', 'status', 'owner_id'])]);
    }

    public function invitations(Request $request): JsonResponse
    {
        $filters = $request->validate(['state' => ['nullable', Rule::in(['pending', 'accepted', 'revoked', 'expired'])], 'search' => 'nullable|string|max:120']);
        $query = Invitation::query()->latest('id');
        match ($filters['state'] ?? null) {
            'pending' => $query->where('status', 'pending')->where('expires_at', '>', now()),
            'expired' => $query->where('status', 'pending')->where('expires_at', '<=', now()),
            'accepted', 'revoked' => $query->where('status', $filters['state']),
            default => null,
        };
        if (! empty($filters['search'])) {
            $query->where('email', 'like', '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], mb_strtolower($filters['search'])).'%');
        }
        $names = Project::pluck('name', 'id');

        return response()->json($query->paginate(25)->through(fn (Invitation $i) => [...InvitationController::present($i), 'project' => $i->project_id ? $names[$i->project_id] ?? null : null])->toArray());
    }
}
