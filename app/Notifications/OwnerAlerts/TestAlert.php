<?php

namespace App\Notifications\OwnerAlerts;

class TestAlert extends OwnerAlert
{
    protected function title(): string
    {
        return 'Alerts are working';
    }

    protected function body(): string
    {
        return "You'll get alerts like this when customers join.";
    }

    protected function tag(): string
    {
        return 'test';
    }
}
