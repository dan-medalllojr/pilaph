<?php

namespace Database\Seeders;

use App\Actions\ResetDemoShop;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // The sample shop from the public demo, for trying things locally.
        app(ResetDemoShop::class)->execute();
    }
}
