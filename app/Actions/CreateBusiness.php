<?php

namespace App\Actions;

use App\Enums\UserRole;
use App\Models\Business;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CreateBusiness
{
    /**
     * Create the owner's business and make them its owner.
     * Safe to call twice (e.g. a double-submitted form): the second call
     * returns the business created by the first.
     */
    public function execute(User $owner, string $name): Business
    {
        return DB::transaction(function () use ($owner, $name): Business {
            // Lock the user row so two simultaneous submits can't both create a business.
            $owner = User::query()->lockForUpdate()->findOrFail($owner->id);

            if ($owner->business_id !== null) {
                return Business::query()->findOrFail($owner->business_id);
            }

            // Every new shop starts with a free trial of a paid plan.
            $business = Business::query()->forceCreate([
                'name' => $name,
                'slug' => $this->uniqueSlug($name),
                'trial_ends_at' => now()->addDays((int) config('plans.trial.days')),
            ]);

            $owner->forceFill([
                'business_id' => $business->id,
                'role' => UserRole::Owner,
            ])->save();

            return $business;
        });
    }

    /**
     * "Juan's Barbershop" -> "juans-barbershop", then "-2", "-3"... if taken.
     * The slug is the shop's public link (/q/{slug}), so it never changes later.
     */
    private function uniqueSlug(string $name): string
    {
        $base = Str::limit(Str::slug(str_replace("'", '', $name)), 50, '') ?: 'shop';
        $slug = $base;

        for ($suffix = 2; Business::query()->where('slug', $slug)->exists(); $suffix++) {
            $slug = "{$base}-{$suffix}";
        }

        return $slug;
    }
}
