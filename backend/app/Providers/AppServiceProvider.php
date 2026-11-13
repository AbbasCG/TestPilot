<?php

namespace App\Providers;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Production default 5/min per account+IP; only the isolated browser-test server raises it.
        $perAccount = max(1, (int) config('auth.login_attempts_per_minute', 5));
        RateLimiter::for('login', fn (Request $request) => [
            Limit::perMinute($perAccount)->by(strtolower((string) $request->input('email')).'|'.$request->ip()),
            Limit::perMinute($perAccount * 6)->by($request->ip()),
        ]);
        $perHour = max(1, (int) config('testpilot.invitations_per_hour', 30));
        RateLimiter::for('invitations', fn (Request $request) => Limit::perHour($perHour)->by('invite|'.($request->user()?->id ?: $request->ip())));
        RateLimiter::for('invitation-public', fn (Request $request) => Limit::perMinute(30)->by('invite-public|'.$request->ip()));
        RateLimiter::for('password-recovery', fn (Request $request) => [
            Limit::perMinute(5)->by('recovery|'.strtolower((string) $request->input('email')).'|'.$request->ip()),
            Limit::perMinute(20)->by('recovery-ip|'.$request->ip()),
        ]);
        RateLimiter::for('password-change', fn (Request $request) => Limit::perMinute(10)->by('password|'.($request->user()?->id ?: $request->ip())));
        RateLimiter::for('admin-actions', fn (Request $request) => Limit::perMinute(max(1, (int) config('testpilot.admin_actions_per_minute', 30)) * 4)->by('admin|'.$request->user()?->id));
        Gate::define('manageUsers', fn (User $user) => $user->isActive() && $user->isPlatformAdmin());
        ResetPassword::createUrlUsing(fn (User $user, string $token) => config('testpilot.frontend_url').'/reset-password?token='.urlencode($token).'&email='.urlencode($user->email));
        RateLimiter::for('evidence', fn (Request $request) => Limit::perMinute(max(1, (int) config('auth.evidence_uploads_per_minute', 20)))->by($request->user()?->id ?: $request->ip()));
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(max(1, (int) config('auth.api_requests_per_minute', 120)))->by($request->user()?->id ?: $request->ip()));
    }
}
