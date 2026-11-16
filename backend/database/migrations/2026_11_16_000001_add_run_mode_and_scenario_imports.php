<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * Solo test sessions and the scenario import ledger. Additive: every existing
 * run becomes a "collaborative" run, so history and reports are unchanged.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('test_runs', function (Blueprint $table) {
            $table->string('mode', 20)->default('collaborative')->after('title');
        });
        Schema::create('scenario_imports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->uuid('idempotency_key');
            $table->char('payload_hash', 64);
            $table->json('result');
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['project_id', 'idempotency_key']);
        });
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE test_runs ADD CONSTRAINT test_runs_mode_check CHECK (mode IN ('collaborative','solo'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('scenario_imports');
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE test_runs DROP CONSTRAINT IF EXISTS test_runs_mode_check');
        }
        Schema::table('test_runs', function (Blueprint $table) {
            $table->dropColumn('mode');
        });
    }
};
