<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('test_runs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->restrictOnDelete();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->unsignedBigInteger('environment_id');
            $table->foreign(['environment_id', 'project_id'])->references(['id', 'project_id'])->on('environments')->restrictOnDelete();
            $table->json('environment_snapshot');
            $table->string('title', 200);
            $table->string('build_version', 120);
            $table->string('status', 20)->default('active');
            $table->string('outcome', 20)->nullable();
            $table->text('summary')->nullable();
            $table->unsignedInteger('version')->default(1);
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->unique(['id', 'project_id']);
            $table->index(['project_id', 'status']);
        });
        Schema::create('run_participants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('test_run_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->string('role', 1);
            $table->unique(['test_run_id', 'role']);
            $table->unique(['test_run_id', 'user_id']);
            $table->unique(['id', 'test_run_id']);
        });
        Schema::create('run_cases', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('test_run_id');
            $table->unsignedBigInteger('project_id');
            $table->unsignedBigInteger('test_case_id');
            $table->foreignId('scenario_revision_id')->constrained()->restrictOnDelete();
            $table->json('snapshot');
            $table->foreign(['test_run_id', 'project_id'])->references(['id', 'project_id'])->on('test_runs')->restrictOnDelete();
            $table->foreign(['test_case_id', 'project_id'])->references(['id', 'project_id'])->on('test_cases')->restrictOnDelete();
            $table->unique(['test_run_id', 'test_case_id']);
            $table->unique(['id', 'test_run_id']);
        });
        Schema::create('step_results', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('test_run_id');
            $table->unsignedBigInteger('run_case_id');
            $table->unsignedBigInteger('participant_id');
            $table->uuid('step_key');
            $table->string('status', 20)->default('pending');
            $table->text('actual_result')->nullable();
            $table->text('notes')->nullable();
            $table->boolean('verified')->default(false);
            $table->unsignedInteger('version')->default(0);
            $table->timestamps();
            $table->foreign(['run_case_id', 'test_run_id'])->references(['id', 'test_run_id'])->on('run_cases')->restrictOnDelete();
            $table->foreign(['participant_id', 'test_run_id'])->references(['id', 'test_run_id'])->on('run_participants')->restrictOnDelete();
            $table->unique(['run_case_id', 'step_key', 'participant_id']);
            $table->index(['test_run_id', 'status']);
        });
        Schema::create('result_history', function (Blueprint $table) {
            $table->id();
            $table->foreignId('step_result_id')->constrained()->restrictOnDelete();
            $table->foreignId('actor_id')->constrained('users')->restrictOnDelete();
            $table->unsignedInteger('version');
            $table->json('content');
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['step_result_id', 'version']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('result_history');
        Schema::dropIfExists('step_results');
        Schema::dropIfExists('run_cases');
        Schema::dropIfExists('run_participants');
        Schema::dropIfExists('test_runs');
    }
};
