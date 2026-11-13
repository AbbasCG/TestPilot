<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * Platform-level user management: account lifecycle columns on users, secure
 * project invitations (token hashes only) and an append-only account audit
 * trail. Additive only; existing users become active accounts with no
 * platform role.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('platform_role', 20)->nullable()->after('email');
            $table->string('status', 20)->default('active')->after('platform_role');
            $table->boolean('must_change_password')->default(false)->after('password');
            $table->timestamp('password_changed_at')->nullable()->after('must_change_password');
            $table->timestamp('last_login_at')->nullable();
            $table->timestamp('status_changed_at')->nullable();
            $table->text('status_reason')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('version')->default(1);
            $table->index(['status', 'platform_role']);
        });

        Schema::create('invitations', function (Blueprint $table) {
            $table->id();
            $table->string('email');
            $table->foreignId('project_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('project_role', 20)->nullable();
            $table->foreignId('invited_by')->constrained('users')->restrictOnDelete();
            $table->char('token_hash', 64)->unique();
            $table->string('status', 20)->default('pending');
            $table->timestamp('expires_at');
            $table->timestamp('accepted_at')->nullable();
            $table->foreignId('accepted_user_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('revoked_at')->nullable();
            $table->foreignId('revoked_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('last_sent_at');
            $table->unsignedInteger('send_count')->default(1);
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
            $table->index(['email', 'status']);
            $table->index(['project_id', 'status']);
        });

        Schema::create('account_activities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('actor_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->foreignId('invitation_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignId('project_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('action', 60);
            $table->json('metadata');
            $table->string('ip_address', 45)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['user_id', 'id']);
            $table->index(['actor_id', 'id']);
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE users ADD CONSTRAINT users_platform_role_check CHECK (platform_role IS NULL OR platform_role IN ('owner','admin'))");
            DB::statement("ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active','suspended','disabled'))");
            DB::statement("ALTER TABLE invitations ADD CONSTRAINT invitations_status_check CHECK (status IN ('pending','accepted','revoked'))");
            DB::statement("ALTER TABLE invitations ADD CONSTRAINT invitations_role_check CHECK ((project_id IS NULL AND project_role IS NULL) OR (project_id IS NOT NULL AND project_role IN ('manager','tester','viewer')))");
            DB::statement('ALTER TABLE invitations ADD CONSTRAINT invitations_email_lower_check CHECK (email = lower(email))');
            // One live invitation per email and project (NULL project = account-only invitation).
            DB::statement("CREATE UNIQUE INDEX invitations_one_pending ON invitations (email, COALESCE(project_id, 0)) WHERE status = 'pending'");
            DB::statement('CREATE UNIQUE INDEX users_email_lower_unique ON users (lower(email))');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('account_activities');
        Schema::dropIfExists('invitations');
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP INDEX IF EXISTS users_email_lower_unique');
            DB::statement('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_platform_role_check');
            DB::statement('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check');
        }
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['status', 'platform_role']);
            $table->dropConstrainedForeignId('created_by');
            $table->dropColumn(['platform_role', 'status', 'must_change_password', 'password_changed_at', 'last_login_at', 'status_changed_at', 'status_reason', 'version']);
        });
    }
};
