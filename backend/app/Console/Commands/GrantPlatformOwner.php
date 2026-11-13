<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Accounts\AccountAudit;
use Illuminate\Console\Command;

/** Bootstrap/recovery: promotes an existing active account to platform owner. */
class GrantPlatformOwner extends Command
{
    protected $signature = 'testpilot:platform-owner {email}';

    protected $description = 'Grant the platform owner role to an existing account (bootstrap or recovery)';

    public function handle(AccountAudit $audit): int
    {
        $user = User::whereRaw('lower(email) = ?', [strtolower($this->argument('email'))])->first();
        if (! $user || ! $user->isActive()) {
            $this->error('No active account with that e-mail.');

            return self::FAILURE;
        }
        $from = $user->platform_role;
        $user->forceFill(['platform_role' => 'owner', 'version' => $user->version + 1])->save();
        $audit->record('account.platform_role_changed', null, $user->id, ['from' => $from, 'to' => 'owner', 'via' => 'cli']);
        $this->info('Platform owner granted.');

        return self::SUCCESS;
    }
}
