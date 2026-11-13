<?php

namespace App\Services\Accounts;

use App\Models\Invitation;
use App\Models\Project;
use App\Models\User;
use App\Notifications\InvitationNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Single-use, e-mail and project bound invitations. Only the SHA-256 hash of
 * the token is stored. The plain token leaves the server exactly once: by
 * e-mail when mail is enabled, otherwise in the creating/resending response
 * so the inviter can hand it over through a separate trusted channel.
 */
class InvitationService
{
    public function __construct(private MembershipService $memberships, private AccountAudit $audit) {}

    private function authorize(User $actor, ?Project $project): void
    {
        abort_unless($actor->isActive(), 403);
        if ($project) {
            abort_unless($this->memberships->canManage($actor, $project), 403);
        } else {
            abort_unless($actor->isPlatformAdmin(), 403);
        }
    }

    /**
     * @return array{0: Invitation, 1: string|null} the invitation and the plain token when mail is disabled
     */
    public function create(User $actor, string $email, ?Project $project, ?string $role): array
    {
        $this->authorize($actor, $project);
        $email = strtolower(trim($email));
        if ($project && ! in_array($role, MembershipService::ROLES, true)) {
            throw ValidationException::withMessages(['role' => 'اختر دورًا صالحًا داخل المشروع.']);
        }
        $token = Str::random(48);
        $invitation = DB::transaction(function () use ($actor, $email, $project, $role, $token) {
            if ($project) {
                Project::whereKey($project->id)->lockForUpdate()->firstOrFail();
                $isMember = DB::table('project_members')->join('users', 'users.id', '=', 'project_members.user_id')
                    ->where('project_members.project_id', $project->id)->whereRaw('lower(users.email) = ?', [$email])->exists();
                abort_if($isMember, 409, 'هذا البريد عضو في المشروع بالفعل.');
            } elseif (User::whereRaw('lower(email) = ?', [$email])->exists()) {
                throw ValidationException::withMessages(['email' => 'يوجد حساب بهذا البريد بالفعل.']);
            }
            $existing = Invitation::where('email', $email)->where('status', 'pending')
                ->where(fn ($q) => $project ? $q->where('project_id', $project->id) : $q->whereNull('project_id'))->lockForUpdate()->first();
            if ($existing && ! $existing->expires_at->isPast()) {
                abort(409, 'توجد دعوة معلّقة لهذا البريد. أعد إرسالها أو ألغِها من قائمة الدعوات.');
            }
            if ($existing) {
                $existing->forceFill(['status' => 'revoked', 'revoked_at' => now(), 'version' => $existing->version + 1])->save();
            }
            $invitation = new Invitation;
            $invitation->forceFill([
                'email' => $email, 'project_id' => $project?->id, 'project_role' => $project ? $role : null,
                'invited_by' => $actor->id, 'token_hash' => Invitation::hashToken($token), 'status' => 'pending',
                'expires_at' => now()->addHours(config('testpilot.invitation_ttl_hours')), 'last_sent_at' => now(), 'send_count' => 1, 'version' => 1,
            ])->save();
            $this->audit->record('invitation.created', $actor, null, ['email' => $email, 'role' => $role, 'delivery' => $this->deliveryMode()], $invitation->id, $project?->id);

            return $invitation;
        });

        return [$invitation, $this->deliver($invitation, $token)];
    }

    /**
     * @return array{0: Invitation, 1: string|null}
     */
    public function resend(User $actor, Invitation $invitation): array
    {
        $project = $invitation->project_id ? Project::findOrFail($invitation->project_id) : null;
        $this->authorize($actor, $project);
        $token = Str::random(48);
        $invitation = DB::transaction(function () use ($actor, $invitation, $token) {
            $locked = Invitation::lockForUpdate()->findOrFail($invitation->id);
            abort_unless($locked->status === 'pending', 409, 'لا يمكن إعادة إرسال دعوة مقبولة أو ملغاة.');
            $locked->forceFill([
                'token_hash' => Invitation::hashToken($token), 'expires_at' => now()->addHours(config('testpilot.invitation_ttl_hours')),
                'last_sent_at' => now(), 'send_count' => $locked->send_count + 1, 'version' => $locked->version + 1,
            ])->save();
            $this->audit->record('invitation.resent', $actor, null, ['send_count' => $locked->send_count, 'delivery' => $this->deliveryMode()], $locked->id, $locked->project_id);

            return $locked;
        });

        return [$invitation, $this->deliver($invitation, $token)];
    }

    public function revoke(User $actor, Invitation $invitation): Invitation
    {
        $project = $invitation->project_id ? Project::findOrFail($invitation->project_id) : null;
        $this->authorize($actor, $project);

        return DB::transaction(function () use ($actor, $invitation) {
            $locked = Invitation::lockForUpdate()->findOrFail($invitation->id);
            abort_unless($locked->status === 'pending', 409, 'الدعوة ليست معلّقة.');
            $locked->forceFill(['status' => 'revoked', 'revoked_at' => now(), 'revoked_by' => $actor->id, 'version' => $locked->version + 1])->save();
            $this->audit->record('invitation.revoked', $actor, null, [], $locked->id, $locked->project_id);

            return $locked;
        });
    }

    public function findByToken(string $token): ?Invitation
    {
        return strlen($token) === 48 ? Invitation::where('token_hash', Invitation::hashToken($token))->first() : null;
    }

    /**
     * Accepts an invitation. New e-mail: creates the account with the chosen
     * name and password. Existing account: the caller must be signed in as it.
     *
     * @param  array{name?: string, password?: string}  $data
     */
    public function accept(string $token, ?User $current, array $data): User
    {
        return DB::transaction(function () use ($token, $current, $data) {
            $invitation = $this->findByToken($token);
            abort_unless($invitation, 404, 'رابط الدعوة غير صالح.');
            $invitation = Invitation::lockForUpdate()->findOrFail($invitation->id);
            abort_unless($invitation->state() === 'pending', 410, 'انتهت صلاحية هذه الدعوة أو استُخدمت أو أُلغيت. اطلب دعوة جديدة.');
            $existing = User::whereRaw('lower(email) = ?', [$invitation->email])->lockForUpdate()->first();
            if ($existing) {
                abort_unless($current && $current->id === $existing->id, 409, 'سجّل الدخول بالحساب المدعو ثم افتح الرابط مرة أخرى.');
                abort_unless($existing->isActive(), 403, 'لا يمكن قبول الدعوة بهذا الحساب حاليًا. تواصل مع المسؤول.');
                $user = $existing;
            } else {
                abort_if($current !== null, 409, 'أنت مسجّل بحساب آخر. سجّل الخروج ثم افتح رابط الدعوة.');
                $user = new User(['name' => $data['name'], 'email' => $invitation->email, 'password' => $data['password']]);
                $user->forceFill(['status' => 'active', 'must_change_password' => false, 'password_changed_at' => now(), 'email_verified_at' => now(), 'created_by' => $invitation->invited_by, 'version' => 1])->save();
                $this->audit->record('account.created', null, $user->id, ['method' => 'invitation'], $invitation->id, $invitation->project_id);
            }
            if ($invitation->project_id) {
                $project = Project::findOrFail($invitation->project_id);
                $isMember = $project->members()->where('users.id', $user->id)->exists();
                if (! $isMember) {
                    $inviter = User::find($invitation->invited_by) ?? $user;
                    $this->memberships->upsert($project, $inviter, $user, $invitation->project_role, authorize: false, via: 'invitation');
                }
            }
            $invitation->forceFill(['status' => 'accepted', 'accepted_at' => now(), 'accepted_user_id' => $user->id, 'version' => $invitation->version + 1])->save();
            $this->audit->record('invitation.accepted', $user, $user->id, [], $invitation->id, $invitation->project_id);

            return $user;
        });
    }

    public function deliveryMode(): string
    {
        return config('testpilot.mail_enabled') ? 'email' : 'manual_link';
    }

    /** Returns the plain token only when it must be shown to the inviter (mail disabled). */
    private function deliver(Invitation $invitation, string $token): ?string
    {
        if (! config('testpilot.mail_enabled')) {
            return $token;
        }
        $project = $invitation->project_id ? Project::find($invitation->project_id) : null;
        Notification::route('mail', $invitation->email)->notify(new InvitationNotification(
            config('testpilot.frontend_url').'/invite/'.$token, $project?->name, User::find($invitation->invited_by)?->name ?? 'TestPilot', $invitation->expires_at,
        ));

        return null;
    }
}
