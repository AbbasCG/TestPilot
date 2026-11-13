<?php

namespace App\Services\Accounts;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

/**
 * Account lifecycle: creation with a temporary password, mandatory change,
 * suspension, reactivation, disabling and platform roles. Passwords are only
 * ever hashed; generated temporary passwords are returned once to the caller
 * and never stored, logged or audited.
 */
class AccountService
{
    public function __construct(private AccountAudit $audit) {}

    public static function passwordRule(): Password
    {
        return Password::min(12)->max(128)->letters()->mixedCase()->numbers();
    }

    /** Generates a random password that satisfies the policy. */
    public function generatePassword(): string
    {
        do {
            $password = Str::password(20);
        } while (Validator::make(['p' => $password], ['p' => [self::passwordRule()]])->fails());

        return $password;
    }

    /** Admin-side guard: platform owners manage everyone, admins only regular accounts. */
    public function assertCanManage(User $actor, User $target): void
    {
        abort_unless($actor->isActive() && $actor->isPlatformAdmin(), 403);
        abort_if($target->isPlatformAdmin() && ! $actor->isPlatformOwner(), 403, 'يدير مالك المنصة وحده حسابات المسؤولين.');
    }

    /**
     * @param  array{name: string, email: string, platform_role?: string|null}  $data
     * @return array{0: User, 1: string|null} the user and the generated password (null when the admin typed it)
     */
    public function createWithTemporaryPassword(User $actor, array $data, ?string $manualPassword): array
    {
        abort_unless($actor->isActive() && $actor->isPlatformAdmin(), 403);
        $role = $data['platform_role'] ?? null;
        abort_if($role !== null && ! $actor->isPlatformOwner(), 403, 'يمنح مالك المنصة وحده صلاحيات المنصة.');
        $generated = $manualPassword === null ? $this->generatePassword() : null;
        $user = DB::transaction(function () use ($actor, $data, $role, $manualPassword, $generated) {
            $email = strtolower($data['email']);
            if (User::whereRaw('lower(email) = ?', [$email])->lockForUpdate()->exists()) {
                throw ValidationException::withMessages(['email' => 'يوجد حساب بهذا البريد بالفعل.']);
            }
            $user = new User(['name' => $data['name'], 'email' => $email, 'password' => $manualPassword ?? $generated]);
            $user->forceFill(['platform_role' => $role, 'status' => 'active', 'must_change_password' => true, 'created_by' => $actor->id, 'version' => 1])->save();
            $this->audit->record('account.created', $actor, $user->id, ['method' => 'temporary_password', 'generated' => $generated !== null, 'platform_role' => $role]);

            return $user;
        });

        return [$user, $generated];
    }

    /**
     * Admin recovery: sets a new temporary password, forces a change and revokes sessions.
     *
     * @return string|null the generated password, or null when the admin typed it
     */
    public function resetToTemporaryPassword(User $actor, User $target, ?string $manualPassword): ?string
    {
        $this->assertCanManage($actor, $target);
        abort_if($actor->id === $target->id, 422, 'غيّر كلمة مرورك من صفحة حسابك.');
        $generated = $manualPassword === null ? $this->generatePassword() : null;
        DB::transaction(function () use ($actor, $target, $manualPassword, $generated) {
            $locked = User::lockForUpdate()->findOrFail($target->id);
            $locked->forceFill(['password' => $manualPassword ?? $generated, 'must_change_password' => true, 'remember_token' => Str::random(60), 'version' => $locked->version + 1])->save();
            $this->revokeSessions($locked->id);
            $this->audit->record('account.password_reset_by_admin', $actor, $locked->id, ['generated' => $generated !== null]);
        });

        return $generated;
    }

    /** Self-service change, also used to clear the mandatory first-login change. */
    public function changeOwnPassword(User $user, string $current, string $new, ?string $keepSessionId): void
    {
        if (! Hash::check($current, $user->password)) {
            throw ValidationException::withMessages(['current_password' => 'كلمة المرور الحالية غير صحيحة.']);
        }
        if (Hash::check($new, $user->password)) {
            throw ValidationException::withMessages(['password' => 'اختر كلمة مرور مختلفة عن الحالية.']);
        }
        DB::transaction(function () use ($user, $new, $keepSessionId) {
            $locked = User::lockForUpdate()->findOrFail($user->id);
            $wasForced = (bool) $locked->must_change_password;
            $locked->forceFill(['password' => $new, 'must_change_password' => false, 'password_changed_at' => now(), 'remember_token' => Str::random(60), 'version' => $locked->version + 1])->save();
            $this->revokeSessions($locked->id, $keepSessionId);
            $this->audit->record('account.password_changed', $locked, $locked->id, ['was_required' => $wasForced]);
            $user->setRawAttributes($locked->getAttributes(), true);
        });
    }

    /**
     * @param  'suspended'|'disabled'|'active'  $status
     */
    public function setStatus(User $actor, User $target, string $status, ?string $reason): User
    {
        $this->assertCanManage($actor, $target);
        abort_if($actor->id === $target->id, 422, 'لا يمكنك تغيير حالة حسابك بنفسك.');

        return DB::transaction(function () use ($actor, $target, $status, $reason) {
            $locked = User::lockForUpdate()->findOrFail($target->id);
            abort_if($locked->status === $status, 409, 'الحساب بهذه الحالة بالفعل.');
            if ($status !== 'active' && $locked->isPlatformOwner()) {
                $this->assertAnotherActiveOwner($locked->id);
            }
            $from = $locked->status;
            $locked->forceFill(['status' => $status, 'status_reason' => $status === 'active' ? null : $reason, 'status_changed_at' => now(), 'remember_token' => Str::random(60), 'version' => $locked->version + 1])->save();
            if ($status !== 'active') {
                $this->revokeSessions($locked->id);
            }
            $this->audit->record('account.status_changed', $actor, $locked->id, ['from' => $from, 'to' => $status, 'reason' => $reason]);

            return $locked;
        });
    }

    public function setPlatformRole(User $actor, User $target, ?string $role): User
    {
        abort_unless($actor->isActive() && $actor->isPlatformOwner(), 403, 'يمنح مالك المنصة وحده صلاحيات المنصة.');

        return DB::transaction(function () use ($actor, $target, $role) {
            $locked = User::lockForUpdate()->findOrFail($target->id);
            if ($locked->isPlatformOwner() && $role !== 'owner') {
                $this->assertAnotherActiveOwner($locked->id);
            }
            $from = $locked->platform_role;
            $locked->forceFill(['platform_role' => $role, 'version' => $locked->version + 1])->save();
            $this->audit->record('account.platform_role_changed', $actor, $locked->id, ['from' => $from, 'to' => $role]);

            return $locked;
        });
    }

    public function updateProfile(User $actor, User $target, string $name, int $version): User
    {
        $this->assertCanManage($actor, $target);

        return DB::transaction(function () use ($actor, $target, $name, $version) {
            $locked = User::lockForUpdate()->findOrFail($target->id);
            abort_if($locked->version !== $version, 409, 'تغيّر الحساب. حدّث الصفحة.');
            $locked->forceFill(['name' => $name, 'version' => $locked->version + 1])->save();
            $this->audit->record('account.profile_updated', $actor, $locked->id, ['fields' => ['name']]);

            return $locked;
        });
    }

    private function assertAnotherActiveOwner(int $exceptUserId): void
    {
        $others = User::where('platform_role', 'owner')->where('status', 'active')->where('id', '!=', $exceptUserId)->lockForUpdate()->pluck('id')->count();
        abort_if($others === 0, 422, 'لا يمكن إيقاف أو تخفيض آخر مالك نشط للمنصة.');
    }

    /** Deletes stored sessions (database driver) except the current one. */
    public function revokeSessions(int $userId, ?string $exceptSessionId = null): void
    {
        if (config('session.driver') === 'database') {
            DB::table(config('session.table', 'sessions'))->where('user_id', $userId)
                ->when($exceptSessionId, fn ($q) => $q->where('id', '!=', $exceptSessionId))->delete();
        }
    }
}
