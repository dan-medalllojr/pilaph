# Manual test cases

Things to check by hand that the automated tests (`composer ci:check`) can only pretend: here, a real HitPay checkout. Tick each box when it passes, and note the date at the top of the section.

## Paying for a plan (HitPay)

Last run: _not yet_

### Setup

- A HitPay **sandbox** account with **Singapore** as the business country (the sandbox has no QR Ph and only allows Singapore accounts), a test bank account added, and **cards** turned on under Settings → Payment Methods.
- In `.env`: the sandbox `HITPAY_API_KEY`, `HITPAY_SALT=local-test`, `HITPAY_SANDBOX=true`, `HITPAY_PAYMENT_METHODS=card`.
- A local test shop at http://localhost:8100. If the test shops from 2026-10-08 are still in your database, log in as `free@pilaph.test` (password `password`; its link name is `test-free`) and, for case 13, `trial@pilaph.test`. Otherwise sign up a new local owner: a new shop starts on the trial, which also serves case 13. To start a case from Free: `php artisan plan:set <link name> free`.
- Pay with HitPay's sandbox test card (usually `4242 4242 4242 4242`, any future date, any CVC).
- To see what HitPay answered when something fails: the newest `HitPay` lines in `storage/logs/laravel.log`.
- On your computer HitPay's webhook can't reach the app; the return page asks HitPay instead. The webhook is checked in the live cases at the end.

### Paying

- [ ] **1. Basic, 1 month.** Plan & billing → Basic, 1 month → **Pay ₱299 with QR Ph** → pay with the test card.
      Expected: back on Plan & billing with "Payment received. Your shop is on Basic until …" (a month from today); "Your plan" says Basic; the payment is under **Payments**; the shop's join page now has the phone field and no "Queue by PilaPH".
- [ ] **2. ₱1,000 or more.** From Free: Pro, 3 months → Pay ₱2,397 → pay.
      Expected: counted like case 1 (HitPay writes "2,397.00"; this was a bug once).
- [ ] **3. Renewing early.** Right after case 1, pay Basic, 1 month again.
      Expected: Basic until two months from today (added after the current end, not from today).
- [ ] **4. Upgrading.** On Basic (case 1), choose Pro, 1 month. Before paying, the page shows "Pro until …", a bit more than a month away (the unused Basic days become Pro days). Pay.
      Expected: Pro until that date.
- [ ] **5. Leaving the checkout unfinished.** Pay → on HitPay's page, go back without paying.
      Expected: Plan & billing shows "You started paying ₱… but we haven't received it yet." **Continue paying** opens the same HitPay page; **I paid, check again** says it hasn't been received.

### Paying only once

- [ ] **6. Double tap.** Tap **Pay** twice quickly (or press it, go back, and press it again with the same choice).
      Expected: the same HitPay page both times (same address). In HitPay's sandbox dashboard → Payment Requests: only one new request.
- [ ] **7. Two tabs.** Open Plan & billing in two tabs, choose the same plan and months in both, press Pay in both.
      Expected: both open the same HitPay page; one request in HitPay's dashboard.
- [ ] **8. Changing your mind.** Press Pay for Basic, 3 months, go back without paying, then press Pay for Pro, 1 month.
      Expected: a new HitPay page for ₱799. In HitPay's dashboard the ₱897 request is gone (deleted), so its QR code can't be paid. Plan & billing offers only the ₱799 one to continue.
- [ ] **9. An old checkout that was paid.** Press Pay for Basic, 1 month and **pay it**, but close HitPay's tab as soon as it says it's paid, before it sends you back. Open Plan & billing (it still shows the payment as unfinished) and press Pay for Pro, 1 month.
      Expected: no new payment; the message "Your earlier payment for Basic, 1 month went through, so your plan is already updated. Check it before paying again." and Basic is on. If HitPay sends you back too fast to try this, skip it: the automated tests cover it.
- [ ] **10. The return link can't be faked.** Leave a payment unfinished (case 5). Copy the address of the **I paid, check again** link (it's `/dashboard/plan/payments/<id>`), add `?status=completed` to it, and open that.
      Expected: "We haven't received this payment yet"; the plan doesn't change.

### Limits

- [ ] **11. 13 months ahead.** Pay Pro, 12 months (or run `php artisan plan:set test-free pro --months=12`), then open Plan & billing.
      Expected: every length is greyed out, **Pay** is disabled, and the page says "You've already paid until …, and a plan can be paid up to 13 months ahead. You can pay again from …".
- [ ] **12. No cheaper plan while a dearer one runs.** On Pro (case 11), choose Basic.
      Expected: "You're on Pro until …. You can switch to Basic after that." and **Pay** disabled.
- [ ] **13. During the trial.** Log in as `trial@pilaph.test`. Pro, 1 month says "Pro until …" a month after the trial ends; Basic says "(starts now; your trial ends)".
- [ ] **14. The demo.** "Try the demo" → Plan & billing.
      Expected: no payment form.
- [ ] **15. Without HitPay.** Empty `HITPAY_API_KEY` in `.env`, reload Plan & billing.
      Expected: no payment form; the manual GCash/Maya steps (or "Paid plans open soon"). Put the key back afterwards.

### Live, once HitPay has verified the business (needs BIR registration)

Settings: the live `HITPAY_API_KEY`, `HITPAY_SALT` = the live webhook's salt, `HITPAY_SANDBOX=false`, no `HITPAY_PAYMENT_METHODS` (QR Ph). In HitPay's live dashboard: QR Ph turned on, and the webhook `https://pilaph-production.up.railway.app/webhooks/hitpay` for `payment_request.completed` and `payment_request.failed`.

- [ ] **L1. QR Ph for real.** On production, your own test shop → Basic, 1 month → Pay ₱299 → scan the QR Ph code with GCash or Maya.
      Expected: "Payment received"; Basic on; the payment listed; HitPay's dashboard shows ₱299 received, less the ₱20 fee.
- [ ] **L2. The webhook alone.** Pay again (Basic, 1 month), and close HitPay's tab as soon as it says it's paid, before it sends you back. Wait a minute, then open Plan & billing.
      Expected: the plan already shows the extra month, and no unfinished payment (HitPay's webhook switched it on). If HitPay sends you back too fast, check Railway's logs for a `POST /webhooks/hitpay` answered `204` instead.
- [ ] **L3. Clean up.** Refund the test payments in HitPay's dashboard, then `php artisan --env=production plan:set <your shop> free`.
