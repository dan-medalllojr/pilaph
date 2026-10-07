<?php

namespace App\Http\Controllers;

use App\Actions\ResetDemoShop;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * "Try the demo": sign in as the sample shop's owner, and back out to sign up.
 */
class DemoController extends Controller
{
    public function store(Request $request, ResetDemoShop $reset): RedirectResponse
    {
        abort_unless(config('demo.enabled'), 404);

        $owner = User::query()->where('email', config('demo.email'))->first();
        if ($owner?->business === null) {
            $owner = $reset->execute();
        }

        Auth::login($owner);
        $request->session()->regenerate();

        return to_route('dashboard');
    }

    /**
     * Leave the demo to create a real account.
     */
    public function destroy(Request $request): RedirectResponse
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return to_route('register');
    }
}
