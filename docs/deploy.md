# Deploying PilaPH (Railway + Supabase)

Production runs one Docker image on Railway: nginx + PHP-FPM, the queue worker and the scheduler (see `docker/supervisord.conf`). Supabase provides the Postgres database, Realtime (live updates) and Storage (shop photos).

Do the steps in order. Keep every secret in Railway's variables, never in the repository.

## 1. Supabase (production project)

Create a **new** project for production, separate from the one used for development.

- **Region:** Southeast Asia (Singapore), the closest to the Philippines.
- **Plan:** free projects pause after about a week without use and have no backups. Move to Pro once real shops depend on it.

Then collect:

| What                                   | Where in Supabase                                | Railway variable                                                                                                                          |
| -------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Database (Session pooler, IPv4)        | Connect → Connection string → **Session pooler** | `DB_HOST`, `DB_PORT` (5432), `DB_DATABASE` (postgres), `DB_USERNAME` (`postgres.<project-ref>`), `DB_PASSWORD`, plus `DB_SSLMODE=require` |
| Project URL                            | Project Settings → API                           | `SUPABASE_URL` and `VITE_SUPABASE_URL`                                                                                                    |
| Secret key (`sb_secret_...`)           | Project Settings → API Keys                      | `SUPABASE_SERVICE_ROLE_KEY` (server only)                                                                                                 |
| Publishable key (`sb_publishable_...`) | Project Settings → API Keys                      | `VITE_SUPABASE_ANON_KEY`                                                                                                                  |

**Storage bucket for shop photos:** Storage → New bucket → name `shop-photos`, **Public** on. Optionally limit uploads to 4 MB and the types `image/jpeg, image/png, image/webp`. Then set `SUPABASE_STORAGE_BUCKET=shop-photos`.

Realtime is on by default; nothing to set up. The app only uses public Broadcast channels and never trusts their contents (Plan.md, "Real-time design rules").

## 2. Email (account verification and password reset)

Emails go through [Resend](https://resend.com)'s API (Laravel's built-in `resend` mailer).

1. In Resend, **Domains → Add Domain**, add the DNS records it shows at your domain registrar, and wait for **Verified**. Without a verified domain, Resend only delivers to your own Resend account's inbox, so owners couldn't verify their email.
2. **API Keys → Create API Key** (sending access is enough).
3. Set:

```
MAIL_MAILER=resend
RESEND_API_KEY=re_...
MAIL_FROM_ADDRESS=no-reply@your-domain
MAIL_FROM_NAME=PilaPH
```

No domain yet? Use any SMTP service that lets you send from an address you own, for example Gmail with an app password (`MAIL_MAILER=smtp`, `MAIL_HOST=smtp.gmail.com`, `MAIL_PORT=587`, your Gmail address as `MAIL_USERNAME` and `MAIL_FROM_ADDRESS`, the app password as `MAIL_PASSWORD`), and switch to Resend once you have a domain.

Owners who sign in with Google don't need email verification, but email-and-password sign-ups do. After the first deploy, try **Forgot your password?** with your own address to check that email arrives.

## 3. Railway

1. **New Project → Deploy from GitHub repo**, and pick this repository (branch `main`). Railway finds the `Dockerfile` and `railway.json`. `railway.json` sets:
    - migrations before each deploy (`php artisan migrate --force`)
    - a health check on `/up`
    - one replica
    - no sleeping
2. **Settings → Region:** Southeast Asia (Singapore).
3. **Settings → Networking → Generate Domain**, or add your own domain. This is your `APP_URL`.
4. **Variables:** add everything in the table below, then redeploy.
5. **Usage → set a spending limit** and usage alerts.

Keep it at **one replica**. Every replica runs its own scheduler; the timed jobs are safe to repeat, but there's no benefit.

## 4. Variables

| Variable                                                                        | Value                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_NAME`                                                                      | `PilaPH`                                                                                                                                                                                                                     |
| `APP_ENV`                                                                       | `production`                                                                                                                                                                                                                 |
| `APP_DEBUG`                                                                     | `false`                                                                                                                                                                                                                      |
| `APP_KEY`                                                                       | Run `php artisan key:generate --show` locally and paste the result                                                                                                                                                           |
| `APP_URL`                                                                       | `https://your-domain` (no trailing slash)                                                                                                                                                                                    |
| `APP_TIMEZONE`                                                                  | `Asia/Manila`                                                                                                                                                                                                                |
| `LOG_CHANNEL`                                                                   | `stderr` (logs show in Railway)                                                                                                                                                                                              |
| `DB_CONNECTION`                                                                 | `pgsql`                                                                                                                                                                                                                      |
| `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DB_SSLMODE` | From step 1                                                                                                                                                                                                                  |
| `QUEUE_CONNECTION`, `CACHE_STORE`, `SESSION_DRIVER`                             | `database`                                                                                                                                                                                                                   |
| `SESSION_SECURE_COOKIE`                                                         | `true`, so login cookies only travel over HTTPS                                                                                                                                                                              |
| `PHP_FPM_MAX_CHILDREN`                                                          | Optional; requests PHP handles at once, 12 by default. Each can use a database connection, as can the queue worker and scheduler: keep it plus 2 at or below Supabase's pooler **Pool Size** (Database → Connection pooling) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`          | From step 1                                                                                                                                                                                                                  |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`                                   | From step 1. Built into the frontend, so **redeploy after changing them**                                                                                                                                                    |
| `MAIL_*`                                                                        | From step 2                                                                                                                                                                                                                  |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                      | Same OAuth client as development. In Google Cloud Console, add `https://your-domain/auth/google/callback` to its **Authorized redirect URIs**                                                                                |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`                        | Copy from your local `.env`. **Never change them later:** new keys silently turn off every owner's push alerts                                                                                                               |
| `SMS_DRIVER`                                                                    | `log` until you have Semaphore, then `semaphore`                                                                                                                                                                             |
| `SEMAPHORE_API_KEY`                                                             | semaphore.co → Account → API                                                                                                                                                                                                 |
| `SEMAPHORE_SENDER_NAME`                                                         | Empty until Semaphore approves your sender name (an unapproved name makes every text fail)                                                                                                                                   |
| `DEMO_ENABLED`                                                                  | `true` for the public "Try the demo" button                                                                                                                                                                                  |
| `HITPAY_API_KEY`, `HITPAY_SALT`                                                 | Paying for plans by QR Ph: HitPay → Developers (the API key, and the webhook's salt). See "Plans and payments" below                                                                                                         |
| `HITPAY_SANDBOX`                                                                | `true` while testing with HitPay's sandbox; `false` with the live account                                                                                                                                                    |
| `HITPAY_PAYMENT_METHODS`                                                        | Empty in production (QR Ph). `card` with the sandbox, which has no QR Ph                                                                                                                                                     |
| `PAYMENT_GCASH_NUMBER`, `PAYMENT_MAYA_NUMBER`, `PAYMENT_ACCOUNT_NAME`           | Where owners pay for a plan, shown on Plan & billing. Leave empty what you don't use                                                                                                                                         |
| `PAYMENT_CONTACT`                                                               | Where owners send the receipt screenshot: an email address or a link (e.g. your Facebook page). All payment variables empty: "Paid plans open soon"                                                                          |
| `SUPPORT_QR_URL`                                                                | Optional: "Support the developer" QR at the bottom of owner pages, e.g. `/images/support-qr.png` (a file in `public/images/`) or an `https://` image address. Empty: hidden                                                  |

## 5. After the first deploy

- Open the site: the landing page should load, and `/up` should say the app is up.
- Sign up as the first owner, and set up your shop, services and chairs.
- With the demo on, run the demo reset once from Railway's shell or wait for the hour: `php artisan demo:reset`. "Try the demo" also builds it on first use.
- Turn on push alerts on your phone (Settings → Alerts; on iPhone, from the Home Screen app on iOS 16.4 or later).
- Print the QR poster, or open the TV link on the shop's TV.

## Plans and payments

Prices and limits are in `config/plans.php`.

### Paying by QR Ph (HitPay)

Owners pay on Plan & billing: they pick a plan and 1, 3, 6 or 12 months, scan a QR Ph code on HitPay's page with GCash, Maya or their bank app, and the plan switches on by itself. HitPay charges 1% or ₱20 per payment (whichever is higher) and pays out the next day.

1. **Try it in the sandbox first** (test money only). HitPay's sandbox has **no QR Ph**, and its accounts must be **Singapore** businesses, so make a separate sandbox account at https://dashboard.sandbox.hit-pay.com with Singapore as the country (your live account stays Philippine). In it: **Settings → Payment Methods**, turn on cards; **Developers → API Keys**, copy the API key; **Developers → Webhooks**, add the endpoint `https://your-domain/webhooks/hitpay` with the event `payment_request.completed` (and `payment_request.failed`), and copy its **salt**.
2. Set `HITPAY_API_KEY`, `HITPAY_SALT`, `HITPAY_SANDBOX=true` and `HITPAY_PAYMENT_METHODS=card`, and pay for a plan from a test shop with HitPay's test card.
3. **Go live** once HitPay has verified your (Philippine) business: do step 1 again in the live dashboard (turn on QR Ph there), then set the live `HITPAY_API_KEY` and `HITPAY_SALT`, `HITPAY_SANDBOX=false`, and remove `HITPAY_PAYMENT_METHODS` (QR Ph is the default). Make one real ₱299 payment for your own shop to check QR Ph itself; refund it from HitPay's dashboard if you like.

On your computer HitPay can't reach the webhook, but paying still works: when HitPay sends you back, the app asks HitPay whether it was paid.

Refunds are done in HitPay's dashboard; then correct the shop's plan with `plan:set` (below).

### Without HitPay, or for special cases

Without `HITPAY_API_KEY`, Plan & billing shows manual steps instead: owners send GCash or Maya (the `PAYMENT_*` variables) with their shop's link name in the message, then send you the receipt. Check the payment, then in Railway's shell (or from your computer with the production settings):

```bash
php artisan plan:list                                       # every shop: plan, end date, customers and texts this month
php artisan plan:set juans-barbershop basic --months=1      # by link name or the owner's email
php artisan plan:set juans-barbershop pro --forever         # a shop you don't charge
php artisan plan:set juans-barbershop free                  # end a plan or trial now
```

Owners can pay up to 13 months ahead (`max_months_ahead` in `config/plans.php`). `plan:set` is also how you give a shop a free plan, go past that limit, or fix a plan after a refund. Paying again for the same plan before it ends adds the months after the current end date, and upgrading from Basic to Pro turns the unused Basic days into Pro days of the same value. When a plan ends, the shop moves to Free by itself; its older history is kept 30 more days in case they renew.

Every night at 3:15 AM, `data:prune` erases customer names and phone numbers a week after their visit and deletes history older than each plan keeps, so the database stays small.

## Updating

Push to `main`. Railway rebuilds the image, runs migrations, and switches over once `/up` is healthy. Running workers restart with the new code automatically.
