<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Owner pages need a business. New sign-ups go to the setup page first.
 */
class EnsureUserHasBusiness
{
    /**
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->business_id === null) {
            return redirect()->route('business.setup');
        }

        return $next($request);
    }
}
