<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;

class CreateUser extends Command
{
    protected $signature = 'testpilot:user {email} {--name=}';

    protected $description = 'Provision a TestPilot account with an interactive hidden password';

    public function handle(): int
    {
        $data = ['email' => strtolower($this->argument('email')), 'name' => $this->option('name') ?: $this->ask('Name'), 'password' => $this->secret('Password (at least 12 characters)')];
        $validator = Validator::make($data, ['email' => 'required|email|unique:users,email', 'name' => 'required|string|max:120', 'password' => 'required|string|min:12']);
        if ($validator->fails()) {
            $this->error($validator->errors()->first());

            return self::FAILURE;
        }
        User::create($data);
        $this->info('Account created.');

        return self::SUCCESS;
    }
}
