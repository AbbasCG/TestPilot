<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
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
        RateLimiter::for('evidence', fn (Request $request) => Limit::perMinute(max(1, (int) config('auth.evidence_uploads_per_minute', 20)))->by($request->user()?->id ?: $request->ip()));
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(max(1, (int) config('auth.api_requests_per_minute', 120)))->by($request->user()?->id ?: $request->ip()));
    }
}
