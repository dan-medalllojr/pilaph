<?php

namespace App\Http\Controllers\Owner;

use App\Http\Controllers\Controller;
use App\Models\Business;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * Base for owner pages. Routes using it sit behind EnsureUserHasBusiness.
 */
abstract class OwnerController extends Controller
{
    protected function owner(Request $request): User
    {
        $user = $request->user();
        abort_unless($user instanceof User, 403);

        return $user;
    }

    /**
     * The signed-in owner's business. Owner pages only ever act on this one.
     */
    protected function business(Request $request): Business
    {
        $business = $this->owner($request)->business;
        abort_unless($business instanceof Business, 404);

        return $business;
    }
}
