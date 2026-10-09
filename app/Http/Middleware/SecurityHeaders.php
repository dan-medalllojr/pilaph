<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Browser protections on every page:
 *
 * - no other site may show our pages in a frame, so nobody can lay an
 *   invisible dashboard over their own page and trick a tap on "Call next";
 * - files are never guessed as another type (e.g. a photo run as a script);
 * - links to other sites send only our domain, never the page address
 *   (a ticket's address is that customer's key);
 * - over HTTPS, browsers stay on HTTPS for this domain from then on.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Content-Security-Policy', "frame-ancestors 'none'");
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');

        // Only over HTTPS (Railway's proxy says so); a browser ignores it on plain HTTP anyway.
        if ($request->secure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000');
        }

        return $response;
    }
}
