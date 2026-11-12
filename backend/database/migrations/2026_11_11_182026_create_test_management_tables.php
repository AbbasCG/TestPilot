<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('environments', function (Blueprint $table) {
            $table->boolean('archived')->default(false);
            $table->unsignedInteger('version')->default(1);
            $table->unique(['id', 'project_id']);
        });
        Schema::create('test_suites', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->restrictOnDelete();
            $table->string('name', 160);
            $table->text('description')->nullable();
            $table->unsignedInteger('position')->default(0);
            $table->boolean('archived')->default(false);
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
            $table->unique(['id', 'project_id']);
            $table->index(['project_id', 'position']);
        });
        Schema::create('test_cases', function (Blueprint $table) {
            $table->id();
            $table->uuid('uid')->unique();
            $table->foreignId('project_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('suite_id');
            $table->unsignedBigInteger('environment_id')->nullable();
            $table->string('title', 200);
            $table->string('priority', 20);
            $table->string('status', 20);
            $table->boolean('is_template')->default(false);
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
            $table->unique(['id', 'project_id']);
            $table->foreign(['suite_id', 'project_id'])->references(['id', 'project_id'])->on('test_suites')->restrictOnDelete();
            $table->foreign(['environment_id', 'project_id'])->references(['id', 'project_id'])->on('environments')->restrictOnDelete();
            $table->index(['project_id', 'status']);
        });
        Schema::create('scenario_revisions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('test_case_id')->constrained()->restrictOnDelete();
            $table->foreignId('author_id')->constrained('users')->restrictOnDelete();
            $table->unsignedInteger('version');
            $table->json('content');
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['test_case_id', 'version']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('scenario_revisions');
        Schema::dropIfExists('test_cases');
        Schema::dropIfExists('test_suites');
        Schema::table('environments', function (Blueprint $table) {
            $table->dropUnique(['id', 'project_id']);
            $table->dropColumn(['archived', 'version']);
        });
    }
};
