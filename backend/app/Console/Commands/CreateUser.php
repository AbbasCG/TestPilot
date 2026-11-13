<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Accounts\AccountAudit;
use App\Services\Accounts\AccountService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

/**
 * Bootstrap only: creates the first platform owner (or a recovery account).
 * Day-to-day accounts are created from «إدارة المستخدمين» in the app.
 */
class CreateUser extends Command
{
    protected $signature = 'testpilot:user {email} {--name=} {--platform-role= : owner or admin}';

    protected $description = 'Provision a TestPilot account with an interactive hidden password (use for the first platform owner)';

    public function handle(AccountAudit $audit): int
    {
        $data = ['email' => strtolower($this->argument('email')), 'name' => $this->option('name') ?: $this->ask('Name'), 'platform_role' => $this->option('platform-role'), 'password' => $this->secret('Password (12+ characters, upper and lower case letters and a number)')];
        $validator = Validator::make($data, [
            'email' => 'required|email|unique:users,email', 'name' => 'required|string|max:120',
            'platform_role' => ['nullable', Rule::in(['owner', 'admin'])], 'password' => ['required', 'string', AccountService::passwordRule()],
        ]);
        if ($validator->fails()) {
            $this->error($validator->errors()->first());

            return self::FAILURE;
        }
        $user = new User(['name' => $data['name'], 'email' => $data['email'], 'password' => $data['password']]);
        $user->forceFill(['platform_role' => $data['platform_role'], 'status' => 'active', 'password_changed_at' => now(), 'version' => 1])->save();
        $audit->record('account.created', null, $user->id, ['method' => 'cli', 'platform_role' => $data['platform_role']]);
        $this->info('Account created.');

        return self::SUCCESS;
    }
}
