<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\Accounts\AccountAudit;
use App\Services\Accounts\AccountService;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(private AccountService $accounts, private AccountAudit $audit) {}

    public function login(Request $request): JsonResponse
    {
        abort_unless($request->hasSession(), 419, 'ابدأ تسجيل الدخول من واجهة التطبيق.');
        $credentials = $request->validate(['email' => ['required', 'email'], 'password' => ['required', 'string']]);
        $credentials['email'] = strtolower($credentials['email']);
        if (! Auth::guard('web')->attempt($credentials)) {
            throw ValidationException::withMessages(['email' => ['البريد الإلكتروني أو كلمة المرور غير صحيحة.']]);
        }
        /** @var User $user */
        $user = Auth::guard('web')->user();
        if (! $user->isActive()) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
            $this->audit->record('auth.login_refused_inactive', null, $user->id, ['status' => $user->status]);

            return response()->json(['message' => 'هذا الحساب موقوف. تواصل مع مسؤول مساحة العمل.', 'code' => 'account_inactive'], 403);
        }
        $request->session()->regenerate();
        $user->forceFill(['last_login_at' => now()])->saveQuietly();

        return response()->json(['data' => $user->toSelfArray()]);
    }

    public function user(Request $request): JsonResponse
    {
        return response()->json(['data' => $request->user()->toSelfArray()]);
    }

    public function logout(Request $request)
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    public function changePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'confirmed', AccountService::passwordRule()],
        ]);
        $user = $request->user();
        $this->accounts->changeOwnPassword($user, $data['current_password'], $data['password'], $request->session()->getId());
        $request->session()->regenerate();

        return response()->json(['data' => $user->refresh()->toSelfArray()]);
    }

    /** Public: tells the SPA whether e-mail delivery is configured (no account data). */
    public function options(): JsonResponse
    {
        return response()->json(['data' => ['mail_enabled' => (bool) config('testpilot.mail_enabled')]]);
    }

    /** Public: identical response whether or not the address has an account. */
    public function forgotPassword(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email', 'max:255']]);
        if (! config('testpilot.mail_enabled')) {
            return response()->json(['data' => ['mail_enabled' => false, 'message' => 'البريد الإلكتروني غير مُعدّ في مساحة العمل هذه، لذلك لا تُرسل روابط استعادة. تواصل مع مسؤول المنصة ليصدر لك كلمة مرور مؤقتة.']]);
        }
        Password::broker()->sendResetLink(['email' => strtolower($data['email'])]);

        return response()->json(['data' => ['mail_enabled' => true, 'message' => 'إذا كان البريد مسجلًا لدينا فستصلك رسالة تحتوي رابط إعادة التعيين خلال دقائق. الرابط صالح لمدة محدودة ويُستخدم مرة واحدة.']]);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => ['required', 'string', 'max:200'],
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'string', 'confirmed', AccountService::passwordRule()],
        ]);
        $data['email'] = strtolower($data['email']);
        $status = Password::broker()->reset($data, function (User $user, string $password) {
            $user->forceFill(['password' => $password, 'must_change_password' => false, 'password_changed_at' => now(), 'remember_token' => Str::random(60), 'version' => $user->version + 1])->save();
            $this->accounts->revokeSessions($user->id);
            $this->audit->record('account.password_reset_by_link', null, $user->id);
            event(new PasswordReset($user));
        });
        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages(['token' => 'رابط إعادة التعيين غير صالح أو منتهي الصلاحية. اطلب رابطًا جديدًا.']);
        }

        return response()->json(['data' => ['message' => 'تم تعيين كلمة المرور الجديدة. يمكنك تسجيل الدخول الآن.']]);
    }
}
