<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('issues', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('number');
            $table->string('title', 200);
            $table->text('description');
            $table->unsignedBigInteger('test_run_id')->nullable();
            $table->unsignedBigInteger('test_case_id')->nullable();
            $table->unsignedBigInteger('step_result_id')->nullable();
            $table->text('reproduction_steps');
            $table->text('expected_result');
            $table->text('actual_result');
            $table->string('severity', 20);
            $table->string('priority', 20);
            $table->foreignId('reporter_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('assignee_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->string('status', 32)->default('new');
            $table->unsignedBigInteger('environment_id')->nullable();
            $table->json('environment_snapshot')->nullable();
            $table->string('build_version', 120)->nullable();
            $table->unsignedBigInteger('duplicate_of_id')->nullable();
            $table->text('resolution')->nullable();
            $table->unsignedInteger('version')->default(1);
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();
            $table->unique(['project_id', 'number']);
            $table->unique(['id', 'project_id']);
            $table->unique('step_result_id');
            $table->index(['project_id', 'status']);
            $table->index(['project_id', 'severity']);
            $table->index(['project_id', 'assignee_id']);
            $table->foreign(['test_run_id', 'project_id'])->references(['id', 'project_id'])->on('test_runs')->restrictOnDelete();
            $table->foreign(['test_case_id', 'project_id'])->references(['id', 'project_id'])->on('test_cases')->restrictOnDelete();
            $table->foreign('step_result_id')->references('id')->on('step_results')->restrictOnDelete();
            $table->foreign(['environment_id', 'project_id'])->references(['id', 'project_id'])->on('environments')->restrictOnDelete();
        });
        Schema::table('issues', function (Blueprint $table) {
            $table->foreign(['duplicate_of_id', 'project_id'])->references(['id', 'project_id'])->on('issues')->restrictOnDelete();
        });
        Schema::create('issue_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('issue_id')->constrained()->restrictOnDelete();
            $table->foreignId('author_id')->constrained('users')->restrictOnDelete();
            $table->text('body');
            $table->timestamp('created_at')->useCurrent();
            $table->index(['issue_id', 'id']);
        });
        Schema::create('issue_activities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('issue_id')->constrained()->restrictOnDelete();
            $table->foreignId('actor_id')->constrained('users')->restrictOnDelete();
            $table->string('event', 40);
            $table->json('metadata');
            $table->timestamp('created_at')->useCurrent();
            $table->index(['issue_id', 'id']);
        });
        Schema::create('retest_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('issue_id')->constrained()->restrictOnDelete();
            $table->foreignId('project_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('attempt_number');
            $table->foreignId('assignee_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('requested_by')->constrained('users')->restrictOnDelete();
            $table->unsignedBigInteger('environment_id')->nullable();
            $table->string('build_version', 120);
            $table->text('fix_notes');
            $table->json('snapshot');
            $table->string('status', 20)->default('pending');
            $table->text('actual_result')->nullable();
            $table->text('notes')->nullable();
            $table->boolean('verified')->default(false);
            $table->unsignedInteger('version')->default(1);
            $table->timestamp('executed_at')->nullable();
            $table->timestamps();
            $table->unique(['issue_id', 'attempt_number']);
            $table->index(['project_id', 'status']);
            $table->index(['assignee_id', 'status']);
            $table->foreign(['issue_id', 'project_id'])->references(['id', 'project_id'])->on('issues')->restrictOnDelete();
            $table->foreign(['environment_id', 'project_id'])->references(['id', 'project_id'])->on('environments')->restrictOnDelete();
        });
        Schema::create('evidence_files', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('issue_id')->nullable();
            $table->foreignId('step_result_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignId('retest_attempt_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignId('uploaded_by')->constrained('users')->restrictOnDelete();
            $table->string('kind', 20);
            $table->string('path', 255)->unique();
            $table->string('original_name', 180);
            $table->string('mime', 80);
            $table->unsignedBigInteger('size');
            $table->string('sha256', 64);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['project_id', 'issue_id']);
            $table->index(['step_result_id']);
            $table->index(['retest_attempt_id']);
            $table->foreign(['issue_id', 'project_id'])->references(['id', 'project_id'])->on('issues')->restrictOnDelete();
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE issues ADD CONSTRAINT issues_status_check CHECK (status IN ('new','triaged','assigned','in_progress','ready_for_retest','verified','closed','reopened','duplicate','deferred','wont_fix'))");
            DB::statement("ALTER TABLE issues ADD CONSTRAINT issues_severity_check CHECK (severity IN ('blocker','critical','major','minor','trivial'))");
            DB::statement("ALTER TABLE issues ADD CONSTRAINT issues_priority_check CHECK (priority IN ('urgent','high','medium','low'))");
            DB::statement('ALTER TABLE issues ADD CONSTRAINT issues_duplicate_check CHECK (duplicate_of_id IS NULL OR duplicate_of_id <> id)');
            DB::statement("ALTER TABLE retest_attempts ADD CONSTRAINT retest_status_check CHECK (status IN ('pending','passed','failed','cancelled'))");
            DB::statement("CREATE UNIQUE INDEX retest_one_pending_per_issue ON retest_attempts (issue_id) WHERE status = 'pending'");
            DB::statement("ALTER TABLE evidence_files ADD CONSTRAINT evidence_kind_check CHECK (kind IN ('screenshot','video','attachment'))");
            DB::statement('ALTER TABLE evidence_files ADD CONSTRAINT evidence_owner_check CHECK (num_nonnulls(issue_id, step_result_id, retest_attempt_id) >= 1)');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('evidence_files');
        Schema::dropIfExists('retest_attempts');
        Schema::dropIfExists('issue_activities');
        Schema::dropIfExists('issue_comments');
        Schema::dropIfExists('issues');
    }
};
