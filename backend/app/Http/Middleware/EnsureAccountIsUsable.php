<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Server-side account gate for every authenticated API route:
 *  - suspended/disabled accounts are signed out and refused (403 account_inactive);
 *  - accounts with a temporary password may only read their profile, change the
 *    password or sign out (403 password_change_required) until they change it.
 */
class EnsureAccountIsUsable
{
    private const ALLOWED_WHILE_CHANGE_REQUIRED = ['auth.user', 'auth.logout', 'account.password'];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user) {
            return $next($request);
        }
        if (! $user->isActive()) {
            Auth::guard('web')->logout();
            if ($request->hasSession()) {
                $request->session()->invalidate();
                $request->session()->regenerateToken();
            }

            return response()->json(['message' => 'هذا الحساب موقوف. تواصل مع مسؤول مساحة العمل.', 'code' => 'account_inactive'], 403);
        }
        if ($user->must_change_password && ! in_array($request->route()?->getName(), self::ALLOWED_WHILE_CHANGE_REQUIRED, true)) {
            return response()->json(['message' => 'يجب تغيير كلمة المرور المؤقتة قبل المتابعة.', 'code' => 'password_change_required'], 403);
        }

        return $next($request);
    }
}
