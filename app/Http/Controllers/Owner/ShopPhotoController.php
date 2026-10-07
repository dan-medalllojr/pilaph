<?php

namespace App\Http\Controllers\Owner;

use App\Actions\ChangeShopPhoto;
use App\Http\Requests\Owner\UpdateShopPhotoRequest;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;

class ShopPhotoController extends OwnerController
{
    public function store(UpdateShopPhotoRequest $request, ChangeShopPhoto $change): RedirectResponse
    {
        $photo = $request->file('photo');
        abort_unless($photo instanceof UploadedFile, 422);

        $change->execute($this->business($request), $photo);

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Shop photo saved.')]);

        return to_route('business.edit');
    }

    public function destroy(Request $request, ChangeShopPhoto $change): RedirectResponse
    {
        $business = $this->business($request);
        Gate::authorize('update', $business);

        $change->execute($business, null);

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Shop photo removed.')]);

        return to_route('business.edit');
    }
}
