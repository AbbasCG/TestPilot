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
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class InvitationController extends Controller
{
    public function __construct(private InvitationService $invitations, private MembershipService $memberships) {}

    /**
     * Invitation as shown to managers. Never contains the token or its hash.
     *
     * @return array<string, mixed>
     */
    public static function present(Invitation $invitation): array
    {
        return [
            'id' => $invitation->id, 'email' => $invitation->email, 'project_id' => $invitation->project_id,
            'project_role' => $invitation->project_role, 'state' => $invitation->state(),
            'invited_by' => User::find($invitation->invited_by)?->only(['id', 'name']),
            'expires_at' => $invitation->expires_at, 'accepted_at' => $invitation->accepted_at, 'revoked_at' => $invitation->revoked_at,
            'last_sent_at' => $invitation->last_sent_at, 'send_count' => $invitation->send_count, 'created_at' => $invitation->created_at,
        ];
    }

    /** The one-time delivery payload returned when an invitation is created or resent. */
    public static function delivery(Invitation $invitation, ?string $token): array
    {
        return ['invitation' => self::present($invitation), 'delivery' => $token === null ? 'email' : 'manual_link', 'token' => $token];
    }

    private function scopedProject(Project $project): void
    {
        Gate::authorize('view', $project);
    }

    public function projectIndex(Request $request, Project $project): JsonResponse
    {
        $this->scopedProject($project);
        abort_unless($this->memberships->canManage($request->user(), $project), 403);
        $rows = Invitation::where('project_id', $project->id)->orderByRaw("case when status = 'pending' then 0 else 1 end")->latest('id')->limit(100)->get();

        return response()->json(['data' => $rows->map(fn ($i) => self::present($i))]);
    }

    public function projectStore(Request $request, Project $project): JsonResponse
    {
        $this->scopedProject($project);
        $data = $request->validate(['email' => ['required', 'email', 'max:255'], 'role' => ['required', Rule::in(MembershipService::ROLES)]]);
        [$invitation, $token] = $this->invitations->create($request->user(), $data['email'], $project, $data['role']);

        return response()->json(['data' => self::delivery($invitation, $token)], 201);
    }

    /**
     * Resolves what the Team page should offer for an e-mail. Platform admins
     * learn the account state; project owners only learn facts about their own
     * project (member / pending invitation) and otherwise get "unknown", so the
     * response never reveals whether an account exists elsewhere.
     */
    public function resolve(Request $request, Project $project): JsonResponse
    {
        $this->scopedProject($project);
        $actor = $request->user();
        abort_unless($this->memberships->canManage($actor, $project), 403);
        $email = strtolower($request->validate(['email' => ['required', 'email', 'max:255']])['email']);
        $member = DB::table('project_members')->join('users', 'users.id', '=', 'project_members.user_id')
            ->where('project_members.project_id', $project->id)->whereRaw('lower(users.email) = ?', [$email])->first(['users.id', 'users.name', 'project_members.role']);
        if ($member) {
            return response()->json(['data' => ['state' => 'member', 'user' => ['id' => $member->id, 'name' => $member->name], 'role' => $member->role]]);
        }
        $pending = Invitation::where('project_id', $project->id)->where('email', $email)->where('status', 'pending')->first();
        if ($pending && $pending->state() === 'pending') {
            return response()->json(['data' => ['state' => 'pending_invitation', 'invitation' => self::present($pending)]]);
        }
        if (! $actor->isPlatformAdmin()) {
            return response()->json(['data' => ['state' => 'unknown', 'can_create_account' => false]]);
        }
        $user = User::whereRaw('lower(email) = ?', [$email])->first();
        if (! $user) {
            return response()->json(['data' => ['state' => 'not_found', 'can_create_account' => true]]);
        }

        return response()->json(['data' => [
            'state' => $user->isActive() ? 'existing_active' : 'existing_inactive',
            'user' => ['id' => $user->id, 'name' => $user->name, 'status' => $user->status, 'status_reason' => $user->isActive() ? null : DB::table('users')->where('id', $user->id)->value('status_reason')],
        ]]);
    }

    public function resend(Request $request, int $invitation): JsonResponse
    {
        [$model, $token] = $this->invitations->resend($request->user(), Invitation::findOrFail($invitation));

        return response()->json(['data' => self::delivery($model, $token)]);
    }

    public function revoke(Request $request, int $invitation): JsonResponse
    {
        return response()->json(['data' => self::present($this->invitations->revoke($request->user(), Invitation::findOrFail($invitation)))]);
    }

    /** Public preview for the invitation link (rate limited). */
    public function preview(Request $request, string $token): JsonResponse
    {
        $invitation = $this->invitations->findByToken($token);
        abort_unless($invitation, 404, 'رابط الدعوة غير صالح.');
        $current = $request->user('sanctum');
        $accountExists = User::whereRaw('lower(email) = ?', [$invitation->email])->exists();
        $project = $invitation->project_id ? Project::find($invitation->project_id) : null;

        return response()->json(['data' => [
            'state' => $invitation->state(), 'email' => $invitation->email, 'expires_at' => $invitation->expires_at,
            'project' => $project ? ['name' => $project->name] : null, 'project_role' => $invitation->project_role,
            'inviter' => User::find($invitation->invited_by)?->name,
            'account_exists' => $accountExists,
            'signed_in' => $current ? ['email' => $current->email, 'is_invitee' => strtolower($current->email) === $invitation->email] : null,
        ]]);
    }

    public function accept(Request $request, string $token): JsonResponse
    {
        $invitation = $this->invitations->findByToken($token);
        abort_unless($invitation, 404, 'رابط الدعوة غير صالح.');
        $current = $request->user('sanctum');
        $isNew = ! User::whereRaw('lower(email) = ?', [$invitation->email])->exists();
        $data = $isNew ? $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'password' => ['required', 'string', 'confirmed', AccountService::passwordRule()],
        ]) : [];
        $user = $this->invitations->accept($token, $current, $data);
        if ($isNew) {
            Auth::guard('web')->login($user);
            $request->session()->regenerate();
            $user->forceFill(['last_login_at' => now()])->saveQuietly();
        }

        return response()->json(['data' => ['user' => $user->toSelfArray(), 'project_id' => $invitation->project_id]]);
    }
}
