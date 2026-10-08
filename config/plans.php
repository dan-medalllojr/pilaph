<?php

/*
 * What each plan includes and costs (Plan.md, Phase 12). The pricing pages,
 * the limits and the clean-up all read from here, so a price or limit is
 * changed in one place. `null` means no limit.
 */

return [

    'plans' => [
        'free' => [
            'name' => 'Free',
            'price' => 0,
            // Counters (chairs, windows) that can call customers at once.
            'counters' => 1,
            // Customers who can join in a calendar month. Joining closes the
            // day after the limit is reached, never in the middle of a day.
            'monthly_customers' => 300,
            // Texts to customers in a calendar month (0: no phone field).
            'monthly_sms' => 0,
            // Days of ticket history kept; also the longest stats period.
            'history_days' => 30,
            // A shop photo on the join page.
            'photo' => false,
            // "Queue by PilaPH" on customer pages, the TV and the poster.
            'branding' => true,
        ],
        'basic' => [
            'name' => 'Basic',
            'price' => 299,
            'counters' => 3,
            'monthly_customers' => null,
            'monthly_sms' => 300,
            'history_days' => 183,
            'photo' => true,
            'branding' => false,
        ],
        'pro' => [
            'name' => 'Pro',
            'price' => 799,
            'counters' => null,
            'monthly_customers' => null,
            'monthly_sms' => 1000,
            'history_days' => 365,
            'photo' => true,
            'branding' => false,
        ],
    ],

    // Every new shop tries this plan first, with fewer texts (each one costs).
    'trial' => [
        'plan' => 'pro',
        'days' => 14,
        'monthly_sms' => 50,
    ],

    // How many months an owner can pay for at once (no discount: one payment
    // fee, ₱20, whatever the amount, so longer periods lose less to fees).
    'months' => [1, 3, 6, 12],

    // After a paid plan ends, its longer history is kept this many days, so
    // paying late never loses data.
    'grace_days' => 30,

    // Customer names and phone numbers are erased this many days after
    // their queue day. Counts and times stay for the stats.
    'erase_personal_data_after_days' => 7,

    // How owners pay (manually, for now). Shown on the Plan & billing page;
    // leave empty what you don't use.
    // An empty variable counts as not set.
    'payment' => [
        'gcash' => env('PAYMENT_GCASH_NUMBER') ?: null,
        'maya' => env('PAYMENT_MAYA_NUMBER') ?: null,
        'account_name' => env('PAYMENT_ACCOUNT_NAME') ?: null,
        // Where owners send the payment screenshot (an email address or a link).
        'contact' => env('PAYMENT_CONTACT') ?: null,
    ],

];
