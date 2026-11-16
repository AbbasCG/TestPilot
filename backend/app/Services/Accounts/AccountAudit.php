<?php

namespace App\Services\Accounts;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Append-only account administration trail. Callers must never pass
 * passwords, tokens or links in $metadata; keys that look sensitive are
 * stripped defensively.
 */
class AccountAudit
{
    private const FORBIDDEN = ['password', 'temporary_password', 'token', 'token_hash', 'invitation_url', 'link', 'current_password', 'password_confirmation'];

    /**
     * @param  array<string, mixed>  $metadata
     */
    public function record(string $action, ?User $actor, ?int $userId = null, array $metadata = [], ?int $invitationId = null, ?int $projectId = null): void
    {
        $metadata = array_diff_key($metadata, array_flip(self::FORBIDDEN));
        DB::table('account_activities')->insert([
            'actor_id' => $actor?->id, 'user_id' => $userId, 'invitation_id' => $invitationId, 'project_id' => $projectId,
            'action' => $action, 'metadata' => json_encode($metadata, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
            'ip_address' => request()?->ip(), 'created_at' => now(),
        ]);
    }
}
