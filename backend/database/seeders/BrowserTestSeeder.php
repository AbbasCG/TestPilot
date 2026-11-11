<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class BrowserTestSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment('local', 'testing') || ! str_ends_with((string) config('database.connections.pgsql.database'), '_e2e')) {
            throw new \RuntimeException('Browser fixtures require a dedicated *_e2e database and local/testing environment.');
        }
        foreach (['owner', 'tester'] as $role) {
            User::updateOrCreate(['email' => "$role@e2e.test"], ['name' => $role === 'owner' ? 'مدير الجودة' : 'مختبر الجودة', 'password' => 'TestPilot-e2e-only-2026']);
        }
    }
}
