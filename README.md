# PRUspect — Prospect Management System

A personal CRM for an insurance advisor: prospects, sales stages, follow-ups, calendar, insurance
opportunities, dashboard metrics and reports.

- **Frontend:** Vite · React 19 · TypeScript (strict) · Tailwind CSS 4 · Radix UI primitives (shadcn-style components) · TanStack Query · React Hook Form + Zod · Recharts · Motion · dnd-kit · date-fns
- **Backend:** Python 3.13 · Django 5.2 · Django REST Framework · SimpleJWT · django-filter · PostgreSQL

> **Before using real prospect data:** confirm this tool is authorized under the Philippine Data Privacy
> Act of 2012 and your company's data-handling policies. PRUspect is an independent tool; it uses no
> official company logo or branding, and its insurance categories are generic interest areas — verify
> product availability through authorized sources.

---

## Contents

1. [Quick start (development)](#quick-start-development)
2. [Project layout](#project-layout)
3. [Environment variables](#environment-variables)
4. [Creating the first user and demo data](#creating-the-first-user-and-demo-data)
5. [Tests and quality checks](#tests-and-quality-checks)
6. [How the main rules work](#how-the-main-rules-work)
7. [Metric definitions](#metric-definitions)
8. [API reference](#api-reference)
9. [Security](#security)
10. [Privacy, retention and deletion](#privacy-retention-and-deletion)
11. [Backups](#backups)
12. [Phone notifications and the scheduler](#phone-notifications-and-the-scheduler)
13. [Error alerts](#error-alerts)
14. [Two-step verification](#two-step-verification)
15. [Rotating secrets](#rotating-secrets)
16. [Production deployment](#production-deployment)
17. [Known limitations](#known-limitations)

---

## Quick start (development)

Prerequisites: Python 3.12+, Node.js 20.19+, PostgreSQL 15+.

Development ports are **8799** (API) and **5799** (web) so they don't collide with other local projects.

### 1. Database

Any PostgreSQL works; point `DATABASE_URL` at it. This machine uses a **project-local cluster** in
`.pgdata/` on port 5433 (separate from the system PostgreSQL service):

```powershell
.\scripts\dev-db.ps1 start     # also: stop | status | backup
```

To create such a cluster from scratch:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\initdb.exe" -D .pgdata -U pruspect --auth=scram-sha-256 --pwprompt -E UTF8
.\scripts\dev-db.ps1 start
& "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -h localhost -p 5433 -U pruspect pruspect
```

### 2. Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env            # then edit DJANGO_SECRET_KEY and DATABASE_URL
.venv\Scripts\python manage.py migrate
.venv\Scripts\python manage.py createsuperuser     # your login (email + password)
.venv\Scripts\python manage.py runserver 127.0.0.1:8799
```

(macOS/Linux: use `.venv/bin/python`.)

### 3. Frontend

```powershell
cd frontend
npm install
npm run dev                       # http://127.0.0.1:5799
```

The Vite dev server proxies `/api` to `http://127.0.0.1:8799`, so the browser sees one origin (required
for the HttpOnly refresh cookie). Override with `VITE_DEV_API_PROXY` if needed.

### Running on the local network (office / home LAN)

```powershell
# backend/.env: DJANGO_DEBUG=False, add this PC's LAN IPs to DJANGO_ALLOWED_HOSTS,
# CORS_ALLOWED_ORIGINS and CSRF_TRUSTED_ORIGINS (e.g. http://192.168.0.102:5799)
cd backend;  .venv\Scripts\python manage.py runserver 127.0.0.1:8799     # API stays private
cd frontend; npm run serve        # builds, then serves on 0.0.0.0:5799 with the /api proxy
```

Other devices open `http://<this-PC-IP>:5799`. Windows Firewall must allow inbound TCP 5799
(run once in an **Administrator** PowerShell):

```powershell
New-NetFirewallRule -DisplayName "PRUspect web (5799)" -Direction Inbound -Protocol TCP -LocalPort 5799 -Action Allow -Profile Private,Public
```

This is plain HTTP on a trusted network. Don't expose it to the internet; for that, follow
[Production deployment](#production-deployment) (HTTPS, Gunicorn, Nginx).

---

## Project layout

```
backend/
  config/settings/{base,dev,test,prod}.py   environment-specific settings
  config/urls.py                            all routes under /api/v1/
  apps/
    common/         pagination, error format, owner-scoped fields, normalization, safe CSV, timezone helpers
    accounts/       custom User (email login), UserSettings, cookie-based JWT auth views
    prospects/      Prospect, status history, notes (+revisions), configurable sources & categories,
                    statuses.py (stage rules), services.py (business logic), seed_demo command
    activities/     FollowUp (future tasks), FollowUpReschedule, Activity (interaction log), calendar view
    opportunities/  InsuranceOpportunity, pipeline board view
    dashboard/      metrics.py — every KPI/report calculation lives here
    reports/        report endpoints + CSV export
    notifications/  in-app reminders, Web Push, scheduler endpoint, generate_reminders command
    monitoring/     error tracking (server + browser) and admin alerts
    audit/          AuditLog + record()/diff() helpers
  tests/            API/service tests
frontend/src/
  app/              router
  components/       ui/ (button, dialog, menus…), layout/, forms/, data-display/
  features/         auth, dashboard, prospects, follow-ups, calendar, activities, pipeline, reports, settings, quick-actions
  hooks/ lib/ services/ schemas/ types/ styles/ test/
deploy/             nginx.conf, systemd units
scripts/            dev-db.ps1, backup.sh
```

Views handle HTTP; serializers validate input/output; `services.py` modules hold multi-step business
logic inside database transactions; models enforce integrity with constraints and indexes.

---

## Environment variables

Backend (`backend/.env`, see `backend/.env.example`):

| Variable | Purpose |
|---|---|
| `DJANGO_SETTINGS_MODULE` | `config.settings.dev` locally, `config.settings.prod` on servers |
| `DJANGO_SECRET_KEY` | Required. Long random string |
| `JWT_SIGNING_KEY` | Optional separate JWT signing key |
| `DJANGO_DEBUG` | `True` only in development |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated host names |
| `DATABASE_URL` | `postgres://user:pass@host:port/db` |
| `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` | Trusted frontend origins (only needed for a split-origin deployment) |
| `JWT_ACCESS_MINUTES` / `JWT_REFRESH_DAYS` | Token lifetimes (default 15 min / 7 days) |
| `AUTH_COOKIE_SECURE` / `AUTH_COOKIE_SAMESITE` | Refresh cookie flags (`True` / `Strict` in production) |
| `DEFAULT_TIME_ZONE` | Default display timezone for new users (`Asia/Manila`) |
| `THROTTLE_LOGIN` / `THROTTLE_REFRESH` | Rate limits for auth endpoints |
| `REDIS_URL` | Production: shared cache so rate limits apply across workers |
| `GOOGLE_CLIENT_ID` | Enables "Continue with Google" (OAuth Web client ID). Unset = button hidden |
| `GOOGLE_SIGNUP_ENABLED` | `True` lets new people create accounts with Google (default `True`) |
| `GOOGLE_ALLOWED_DOMAINS` | Optional comma list limiting Google sign-up to these email domains |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Phone/desktop push notifications (see below). Unset = push off, in-app reminders still work |
| `CRON_SECRET` | Shared secret for `POST /api/v1/cron/run/` (the scheduler). Unset = endpoint disabled |
| `ADMIN_REQUIRE_2FA` | Admin pages require two-step verification (default `True`) |
| `THROTTLE_CLIENT_ERRORS` | Rate limit for browser error reports (default `30/hour`) |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` | SMTP for error alert emails. Unset `EMAIL_HOST` = no emails |
| `DEFAULT_FROM_EMAIL` | Sender, e.g. `PRUspect <you@gmail.com>` (defaults to `EMAIL_HOST_USER`) |
| `ERROR_ALERT_EMAILS` | Extra comma-separated addresses that also get error alert emails |
| `ERROR_ALERT_EMAIL_ENABLED` | `False` turns error emails off without removing SMTP settings |
| `SITE_URL` | Public address used for links in emails (default `https://pruspect.vercel.app`) |

Frontend (`frontend/.env.local`, optional): `VITE_API_BASE_URL` (default `/api/v1`), `VITE_DEV_API_PROXY`.
Nothing secret belongs in frontend env files.

---

## Creating the first user and demo data

**Google sign-up:** when `GOOGLE_CLIENT_ID` is set, the login page shows *Continue with Google* and
`/signup` lets new people create an account with their Google account. The API verifies Google's ID token
(signature, audience, expiry, verified email). A Google email that matches an existing account signs into
that account (it is linked, not duplicated). Each new account starts empty and private. Google-only users
can add a password later in *Settings → Profile & security*. Set `GOOGLE_SIGNUP_ENABLED=False` to close
sign-ups, or `GOOGLE_ALLOWED_DOMAINS` to restrict them.

To create the Google client: Google Cloud Console → *APIs & Services → Credentials → Create credentials →
OAuth client ID → Web application*. Authorized JavaScript origins: `https://pruspect.vercel.app` (and
`http://localhost:5799` for local testing). No redirect URI is needed. Configure the *OAuth consent screen*
(app name, support email) and publish it so any Google user can sign in.

**Email/password accounts** are created from the server:

```bash
python manage.py createsuperuser          # prompts for email, name, password
```

Optional sample data, **clearly marked**: every demo prospect has `is_demo=True`, an `@example.com`
email, a `+63 900` number and a **Demo** badge in the UI.

```bash
python manage.py seed_demo --email demo@pruspect.local --password "choose-a-password"
python manage.py seed_demo --email you@example.com --reset   # add demo data to an existing user
```

Remove it any time from **Settings → Data & privacy → Remove demo data**.

---

## Tests and quality checks

```bash
# backend
cd backend
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py test tests --settings=config.settings.test

# frontend
cd frontend
npm run typecheck
npm run lint
npm test
npm run build
```

Backend tests cover authentication (cookie, rotation, blacklist, logout), per-user data isolation on
every endpoint, validation, status history and milestones, reopen audit, archive/restore/delete,
duplicate detection, search/filter/sort/pagination, follow-up complete/reschedule/cancel, calendar,
reminders, dashboard KPIs, cohort conversions, opportunity rules and totals, CSV exports.
Frontend tests cover form validation, prospect create/edit, server error mapping, duplicate warnings,
status changes with confirmation, the API client's refresh logic, protected routes, responsive
navigation, and loading/empty/error states.

---

## How the main rules work

**Prospect status** (`apps/prospects/statuses.py`): 14 stages. *Won*, *Lost* and *Not Qualified* are
terminal (shown with distinct solid/icon badges); *On Hold* is paused. Status only changes through
`POST /prospects/{id}/change-status/`, which records `from → to`, reason, user and time. Leaving Lost /
Not Qualified is recorded as a **reopen**. The UI asks for confirmation (and an optional reason) for
lost, disqualified, won and reopen transitions.

**Milestones.** The first time a prospect enters a qualified stage (Needs Analysis, Presentation
Scheduled/Completed, Application In Progress/Submitted, Underwriting, Won) `qualified_at` is stamped;
Application Submitted/Underwriting/Won stamp `application_submitted_at`; Won stamps `policy_issued_at`.
They are never cleared, so conversion metrics are stable even if a prospect is later lost.

**Follow-ups vs activities.** A *FollowUp* is a scheduled task (pending → completed or canceled).
Completing it creates an *Activity* (the permanent interaction log) and, for calls, texts, emails,
meetings and presentations, moves the prospect's *last contact* forward. Document and "Other" tasks
don't count as contact. Completed/canceled items never appear as overdue.

**Rescheduling** updates the same follow-up row and stores the old time in `FollowUpReschedule`, so a
follow-up is always exactly one calendar entry. The scheduled time cannot be edited directly.

**Opportunities.** Estimated annual premium (while open) and actual annualized premium (only when the
stage is *Policy Issued*, which also requires an issuance date) are separate fields, enforced by
database constraints. Leaving the issued stage clears the verified figures. Opportunity stage and
prospect status are separate; when you mark an opportunity issued, the form offers to also move the
prospect to Won (recorded in history).

**Duplicates.** Phones are normalized (`0917 123 4567`, `+63 917 123 4567` → `639171234567`) and emails
lower-cased. The form warns about matches among *your* records and links to them; nothing is merged.

**Timezone.** All datetimes are stored in UTC. "Today", "this week" (Monday–Sunday), "this month" and
overdue are computed in the user's display timezone (Settings; default Asia/Manila), on both backend
and frontend.

---

## Metric definitions

Archived prospects (and their follow-ups/opportunities) are excluded from all metrics. The UI shows
each definition next to the number.

| Metric | Definition |
|---|---|
| Total Prospects | Prospects not archived |
| New This Month | Added since the 1st of the current month (vs. the previous month) |
| Follow-ups Due Today | Pending follow-ups scheduled for today, any time today |
| Overdue Follow-ups | Pending follow-ups scheduled before today |
| Appointments This Week | Online/in-person meetings and presentations scheduled Mon–Sun this week, not canceled |
| Qualified Prospects | Prospects with `qualified_at` set (reached Needs Analysis or later at least once) |
| Policies Issued | Opportunities in *Policy Issued* stage (plus how many were issued this month) |
| Conversion Rate | Prospects that reached Won ÷ all prospects |
| Qualified → Application | Of the cohort's qualified prospects, the share that reached Application Submitted |
| Application → Policy | Of the cohort's prospects that reached Application Submitted, the share that reached Won |
| Prospect → Policy | Of all prospects in the cohort, the share that reached Won |
| Follow-up completion rate | Of follow-ups scheduled in the range (excluding canceled), the share completed |
| Estimated premium pipeline | Sum of estimated annual premium for opportunities in Identified, Proposal, Application In Progress, Application Submitted, Underwriting. An estimate — not revenue |
| Confirmed issued premium | Sum of verified actual annualized premium of issued policies, by issuance date |

**Cohorts:** conversion reports use the prospects *added* in the selected date range as the cohort;
numerators only count members of that same cohort, so policies issued this month are never divided by
prospects created this month. Estimated and issued premiums are never added together, and neither
represents commission or guaranteed earnings.

---

## API reference

All routes are under `/api/v1/`, require a Bearer access token (except login/refresh/logout), and are
scoped to the signed-in user. Errors use `{"detail": "...", "code": "...", "errors": {"field": ["..."]}}`.
Lists are paginated: `?page=&page_size=` (max 100) → `{count, page, page_size, total_pages, results}`.

| Area | Endpoints |
|---|---|
| Auth | `POST auth/login/` · `POST auth/refresh/` · `POST auth/logout/` · `GET/PATCH auth/me/` · `POST auth/change-password/` |
| Prospects | `GET/POST prospects/` · `GET/PATCH/DELETE prospects/{id}/` · `POST prospects/{id}/change-status/` · `POST prospects/{id}/archive/` · `POST prospects/{id}/restore/` · `GET prospects/{id}/history/` · `GET prospects/{id}/timeline/` · `GET prospects/{id}/activities/` · `GET prospects/duplicates/?mobile=&email=` · `GET prospects/export/` (CSV) · `POST prospects/bulk/` · `GET prospects/options/` |
| Notes | `GET/POST notes/?prospect=` · `PATCH notes/{id}/` (keeps revisions; no delete) |
| Follow-ups | `GET/POST follow-ups/` · `GET/PATCH follow-ups/{id}/` · `POST follow-ups/{id}/complete/` · `POST follow-ups/{id}/reschedule/` · `POST follow-ups/{id}/cancel/` · `GET follow-ups/summary/` |
| Activities | `GET/POST activities/` · `GET activities/{id}/` |
| Opportunities | `GET/POST opportunities/` · `GET/PATCH/DELETE opportunities/{id}/` |
| Pipeline | `GET pipeline/` (board grouped by status + premium totals) |
| Calendar | `GET calendar/events/?start=YYYY-MM-DD&end=YYYY-MM-DD` (≤ 100 days) |
| Dashboard | `GET dashboard/summary/` · `dashboard/pipeline/` · `dashboard/activity/` · `dashboard/performance/?period=monthly\|quarterly` |
| Reports | `GET reports/prospects/` · `reports/conversion/` · `reports/pipeline/` · `reports/activity/` (all accept `date_from`, `date_to`) · `GET reports/export/?report=acquisition\|sources\|status\|conversion\|activity\|pipeline` |
| Settings | `GET/PATCH settings/` · `settings/sources/` · `settings/product-categories/` (CRUD; in-use options can only be deactivated) · `GET/DELETE settings/demo-data/` |
| Notifications | `GET notifications/` · `POST notifications/{id}/read/` · `POST notifications/read-all/` |
| Push | `GET push/config/` · `POST/DELETE push/subscribe/` · `POST push/test/` |
| Two-step verification | `GET auth/2fa/` · `POST auth/2fa/setup/` · `auth/2fa/confirm/` · `auth/2fa/disable/` · `auth/2fa/recovery-codes/` · `auth/2fa/verify/` (sign-in step 2) |
| Admin (staff + 2FA) | `admin/users/` (list, summary, deactivate, reactivate, manager) · `admin/errors/` (list, summary, resolve, reopen, resolve-all, test-alert) |
| System | `POST errors/report/` (browser crash reports, no sign-in needed) · `POST cron/run/` (Bearer `CRON_SECRET`) · `GET /api/health/` |

Prospect list filters: `search`, `status` (comma list), `priority`, `source`, `interest`,
`created_from`, `created_to`, `milestone=qualified|application|won`, `stage_kind`, `archived=active|archived|all`,
`ordering=name|created_at|last_contacted_at|priority|next_follow_up_at` (prefix `-` for descending).

---

## Security

- **Tokens:** a 15-minute access token is returned in the response body and kept **in memory only**.
  The refresh token is an **HttpOnly, SameSite=Strict cookie** limited to `/api/v1/auth/` (Secure in
  production). Refresh tokens rotate on every use and the old one is blacklisted; logout blacklists the
  current one and clears the cookie; changing the password blacklists all of them. An access token
  already issued stays valid until it expires (≤ 15 min).
- **CSRF:** refresh and logout require `X-Requested-With: XMLHttpRequest`; cross-site forms can't send
  custom headers, and the cookie is SameSite=Strict.
- **Authorization:** every queryset is filtered by owner on the server; related ids in requests
  (prospect, source, category) are validated against the user's own records; other users' records
  return 404. Front-end route guards are only for UX.
- **Rate limiting:** login 10/min, refresh 60/min per client (configure `REDIS_URL` in production so
  limits are shared across workers).
- **Two-step verification** (authenticator app) is available to everyone and required for admins
  before they can open admin pages. See [Two-step verification](#two-step-verification).
- **CSV exports** neutralize formula injection (`=`, `+`, `-`, `@` prefixes) and are audit-logged.
- **Audit log** records creates, edits (field-level diffs), status changes, archive/restore/delete,
  notes, follow-up changes, opportunity changes, exports and settings changes — never passwords or tokens.
- Production settings enable HTTPS redirect, HSTS, secure cookies, no-sniff and frame denial;
  `manage.py check --deploy` passes (HSTS preload is intentionally left opt-in).

---

## Privacy, retention and deletion

- The prospect form collects only prospecting data and warns against government IDs, bank details,
  passwords or medical details. Location is city/area only.
- Consent is recorded per prospect (obtained, date, how), with preferred contact method and a
  **Do not contact** flag shown throughout the UI.
- **Archive** hides a prospect from lists, pipeline, calendar and metrics but keeps history.
- **Permanent deletion** (for erasure requests) is only available on archived prospects, requires
  typing the full name, removes all related notes/follow-ups/activities/opportunities, and leaves an
  audit entry containing only the record number.
- **Correction requests:** edit the prospect; changes are recorded in the History tab.
- **Retention:** records are kept until you archive/delete them. *Settings → Preferences → retention
  target* records your intended period; automatic purging is not implemented (see limitations) —
  review archived prospects periodically and delete those past your retention period.
- **Access requests:** *Settings → Data & privacy → Export all prospects* produces a CSV.

---

## Backups

**Live (Supabase):** `.github/workflows/backup.yml` runs every night at 2:00 AM Philippine time. It
dumps the `public` schema with `pg_dump` (PostgreSQL 17, matching Supabase), checks the dump lists at
least 10 tables, **encrypts it with AES-256** using a passphrase, and keeps it as a workflow artifact
for 30 days. The repository is public, so the dump is never stored unencrypted. A failed run emails the
repository owner.

Setup (GitHub → repository → *Settings → Secrets and variables → Actions → New repository secret*):

| Secret | Value |
|---|---|
| `BACKUP_DATABASE_URL` | Supabase **session pooler** URI (port 5432) |
| `BACKUP_PASSPHRASE` | Long random passphrase (20+ characters). Store a copy in your password manager — without it the backups can't be opened |

Run it once by hand: *Actions → Nightly database backup → Run workflow*.

Restore (download the artifact from the run's page and unzip it first):

```bash
gpg --decrypt pruspect-YYYY-MM-DD.dump.gpg > pruspect.dump       # asks for the passphrase
pg_restore --list pruspect.dump | head                           # look inside
pg_restore --clean --if-exists --no-owner --dbname="<session pooler URI>" pruspect.dump
```

Restore into a new, empty Supabase project first if you only need to recover some records.
Supabase's own daily backups (paid plans) are a second layer.

**Other setups:**

- Development: `.\scripts\dev-db.ps1 backup` → `backups/pruspect-YYYYMMDD-HHMMSS.dump` (git-ignored).
- Server: `scripts/backup.sh /var/backups/pruspect` (custom-format `pg_dump`, verified with
  `pg_restore --list`, owner-only permissions, 30-day rotation). Schedule nightly via cron and copy the
  files off-server, encrypted.
- Restore: `pg_restore --clean --no-owner --dbname="$DATABASE_URL" backup.dump`.
- Backups contain personal data: restrict access and apply the same retention policy.

---

## Install as an app (PWA)

PRUspect is an installable web app (`frontend/public/manifest.webmanifest`, `frontend/public/sw.js`).

- **Android / desktop Chrome or Edge:** account menu → *Install app* (or the install icon in the address bar).
- **iPhone / iPad:** Safari → Share → *Add to Home Screen* (the app shows these steps).
- The service worker caches only the app's own static files for fast start-up. It **never caches `/api/`
  responses**, so prospect data is not stored on the device. Bump `VERSION` in `sw.js` to force clients to
  refresh cached files after a deployment that changes `sw.js` itself (normal builds update automatically
  because asset file names are content-hashed).
- Icons in `frontend/public/icons/` (regular, maskable and Apple touch sizes).

---

## Phone notifications and the scheduler

Reminders (due and overdue follow-ups, client birthdays, policy anniversaries, premium due dates) are
created as in-app notifications. With Web Push configured, each new notification is also sent to the
phones and computers where the user turned on *Settings → Preferences → Phone notifications*. Pushes
contain only a short title and a link; details open inside the app.

- Generate VAPID keys once and set them on Vercel (and in `backend/.env` locally):
  ```bash
  cd backend
  .venv/Scripts/python -c "from py_vapid import Vapid01 as V; import base64; v=V(); v.generate_keys(); \
  from cryptography.hazmat.primitives import serialization as s; \
  pub=v.public_key.public_bytes(s.Encoding.X962, s.PublicFormat.UncompressedPoint); \
  print('VAPID_PUBLIC_KEY=' + base64.urlsafe_b64encode(pub).decode().rstrip('=')); \
  print('VAPID_PRIVATE_KEY=' + base64.urlsafe_b64encode(v.private_key.private_numbers().private_value.to_bytes(32,'big')).decode().rstrip('='))"
  ```
  `VAPID_SUBJECT` is `mailto:` plus a contact email.
- **iPhone/iPad:** push works only in the installed app (iOS 16.4+): Share → *Add to Home Screen*, open
  it from the home screen, then turn notifications on.
- **Scheduler:** `.github/workflows/scheduler.yml` runs every 30 minutes. It checks `/api/health/`
  (uptime) and calls `POST /api/v1/cron/run/` with `Authorization: Bearer <CRON_SECRET>`, which creates
  reminders for every active user so pushes arrive even when nobody has the app open. Repository secrets:
  `PRUSPECT_URL` (e.g. `https://pruspect.vercel.app`) and `CRON_SECRET` (same value as on Vercel).
  GitHub may delay scheduled runs by a few minutes, and pauses schedules in repositories with no
  activity for 60 days (re-enable them on the Actions tab).

---

## Error alerts

- Unhandled server errors (HTTP 500) and browser crashes are recorded in `apps/monitoring` and grouped
  by fingerprint, so a repeated error increases a counter instead of adding rows. Handled errors
  (validation, 403, 404) are not recorded.
- Only technical details are stored: error type, message, page/API path, stack trace, version, and
  the last affected account. Emails and phone numbers inside messages are masked; request bodies and
  form values are never stored.
- Every active admin gets a notification (and a phone push, if turned on) when a **new** error
  appears or a **resolved** error comes back. Alerts are capped at 10 per admin per hour.
- **Email alerts:** with SMTP configured, each of those alerts is also emailed to every active admin
  (plus any `ERROR_ALERT_EMAILS`). The email has the error type, place, masked message and a link to the
  System page; the stack trace stays in the app. Same cap of 10 per hour. A failing email server
  never breaks the in-app alert.

  Gmail setup: turn on 2-Step Verification for the Google account, create an **App password**
  (Google Account → Security → App passwords), then set on Vercel:
  `EMAIL_HOST=smtp.gmail.com`, `EMAIL_PORT=587`, `EMAIL_HOST_USER=<that Gmail address>`,
  `EMAIL_HOST_PASSWORD=<16-character app password>`. Any other SMTP service (Brevo, Resend,
  Mailgun, Outlook) works the same way. Check it with **Send test alert** on the System page.
- Admins review errors on the **System** page (sidebar), mark them resolved, and can send a test alert.
- If a page crashes, users see a "Something went wrong" screen with Reload instead of a blank page.
  After a new deployment, a stale page reloads itself once.
- Uptime: the scheduler workflow fails (and GitHub emails you) when the site or database is down.

---

## Two-step verification

*Settings → Profile & security → Two-step verification → Turn on*, scan the QR code with an
authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…), enter the 6-digit code,
and save the 10 recovery codes (shown once; only hashes are stored).

- Sign-in with a password **or Google** then asks for a code. Each code works once; the sign-in step
  expires after 5 minutes.
- **Admins must turn it on** before admin pages (Users, System) open. Set `ADMIN_REQUIRE_2FA=False` to
  relax this.
- Lost phone: sign in with a recovery code, then turn 2FA off and on again with the new phone. If the
  recovery codes are lost too, run from your PC with the session pooler URI:
  ```powershell
  cd backend
  $env:DATABASE_URL = "<session pooler URI>"
  .venv\Scripts\python manage.py reset_2fa someone@example.com
  Remove-Item Env:DATABASE_URL
  ```
- Django's built-in admin site (`/django-admin/`) isn't routed on Vercel, so it can't be used to skip 2FA there.

---

## Rotating secrets

Rotate a secret whenever it may have been seen by someone else (shared in chat, a screenshot, a
former team member):

| Secret | How | Effect |
|---|---|---|
| Supabase database password | Supabase → *Project Settings → Database → Reset database password*. Update `DATABASE_URL` on Vercel, `BACKUP_DATABASE_URL` on GitHub, then **redeploy** | None for users |
| `DJANGO_SECRET_KEY` | New value: `python -c "import secrets; print(secrets.token_urlsafe(50))"` → Vercel env → redeploy | Everyone is signed out once |
| `CRON_SECRET` | New random value on Vercel **and** the GitHub secret | None |
| `EMAIL_HOST_PASSWORD` | Revoke the app password in your Google account, create a new one, update Vercel | None |
| VAPID keys | Only if the private key leaked. New pair on Vercel | Everyone must turn phone notifications on again |
| `BACKUP_PASSPHRASE` | New value on GitHub | Older backups still need the old passphrase |

Vercel only applies changed environment variables to **new** deployments: *Deployments → ⋯ → Redeploy*.

---

## Production deployment

Example for Ubuntu with Nginx + Gunicorn + PostgreSQL, serving the SPA and API on one origin.

```bash
# as the deploy user, code in /srv/pruspect
cd /srv/pruspect/backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env   # DJANGO_SETTINGS_MODULE=config.settings.prod, DEBUG=False, real secrets,
                       # ALLOWED_HOSTS=crm.example.com, AUTH_COOKIE_SECURE=True, REDIS_URL=...
.venv/bin/python manage.py migrate
.venv/bin/python manage.py collectstatic --noinput
.venv/bin/python manage.py check --deploy
.venv/bin/python manage.py createsuperuser

cd ../frontend && npm ci && npm run build        # → frontend/dist

sudo cp deploy/pruspect.service /etc/systemd/system/ && sudo systemctl enable --now pruspect
sudo cp deploy/nginx.conf /etc/nginx/sites-available/pruspect   # edit domain + certificate paths
sudo ln -s /etc/nginx/sites-available/pruspect /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
```

Optional: `deploy/pruspect-reminders.service` + timer to pre-generate reminders every 5 minutes.
Upgrades: pull, `pip install -r requirements.txt`, `migrate`, `collectstatic`, `npm ci && npm run build`,
`systemctl restart pruspect`. Take a backup before migrating.

---

## Deploying to Vercel + Supabase

One Vercel project uses [Vercel Services](https://vercel.com/docs/services) (see `vercel.json`):

- `backend` service: Django from `backend/` (Vercel finds `manage.py`; `VERCEL=1` selects
  `config.settings.vercel`). It receives `/api/*` with the `/api` prefix intact.
- `frontend` service: the Vite build from `frontend/`, with every other path falling back to `index.html`.

Both share one domain, so the HttpOnly refresh cookie works. Functions run in Tokyo (`hnd1`) next to the
Supabase database (`ap-northeast-1`); change `regions` if your database is elsewhere. In the Vercel
dashboard keep **Root Directory** empty and **Framework Preset** on *Other*; `vercel.json` defines the builds.

1. **Supabase:** create a project (this deployment uses *Northeast Asia (Tokyo)*). From *Connect*, copy the
   **Transaction pooler** URI (port 6543, for Vercel) and the **Session pooler** URI (port 5432, for
   migrations from your PC). Append `?sslmode=require` if not present.
2. **Schema and first user** (from this PC):
   ```powershell
   cd backend
   $env:DATABASE_URL = "<session pooler URI>"
   .venv\Scripts\python manage.py migrate
   .venv\Scripts\python manage.py createsuperuser
   Remove-Item Env:DATABASE_URL
   ```
3. **Vercel project environment variables** (Production):
   `DATABASE_URL` = transaction pooler URI, `DJANGO_SECRET_KEY` = new random value,
   `DJANGO_ALLOWED_HOSTS` = `.vercel.app` (add custom domains comma-separated).
4. **Deploy:** `npx vercel login` once, then `npx vercel --prod` from the repo root (or connect the
   Git repository in the Vercel dashboard).

Run `migrate` again from your PC (step 2) whenever a release adds migrations, before deploying.
Rate limits are per function instance on Vercel; add a shared cache (`REDIS_URL`, e.g. Upstash) for
strict limits. Reminders are generated whenever the app polls notifications and by the scheduler
workflow (see [Phone notifications and the scheduler](#phone-notifications-and-the-scheduler)).

Also set on Vercel: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`. GitHub
repository secrets: `PRUSPECT_URL`, `CRON_SECRET`, `BACKUP_DATABASE_URL`, `BACKUP_PASSPHRASE`.

---

## Known limitations

- **Reminders are in-app and push only.** Only error alerts are emailed (to admins); reminders by
  email/SMS are not implemented.
- **Teams are totals only.** A manager sees team members' counts, never their prospects; there is no
  record sharing or assignment.
- **Stage list is fixed in code** (labels editable in `statuses.py`/`constants.ts`); sources and
  insurance categories are configurable in Settings.
- **No automatic retention purge**; the retention setting is informational.
- Calendar week view lists events per day rather than an hourly grid. Drag-to-reschedule moves the
  day and keeps the time.
- Pipeline drag-and-drop works with mouse/touch; keyboard users use the per-card **Move** menu.
- Gunicorn does not run on Windows; use `runserver` for local development and Linux for production.
- `PRU` in the product name may resemble a company brand — confirm naming is acceptable before
  wider use.
