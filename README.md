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
12. [Production deployment](#production-deployment)
13. [Known limitations](#known-limitations)

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
    notifications/  in-app reminders, generate_reminders command
    audit/          AuditLog + record()/diff() helpers
  tests/            73 API/service tests
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

Frontend (`frontend/.env.local`, optional): `VITE_API_BASE_URL` (default `/api/v1`), `VITE_DEV_API_PROXY`.
Nothing secret belongs in frontend env files.

---

## Creating the first user and demo data

Public registration is disabled. Create accounts from the server:

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

- Development: `.\scripts\dev-db.ps1 backup` → `backups/pruspect-YYYYMMDD-HHMMSS.dump` (git-ignored).
- Server: `scripts/backup.sh /var/backups/pruspect` (custom-format `pg_dump`, verified with
  `pg_restore --list`, owner-only permissions, 30-day rotation). Schedule nightly via cron and copy the
  files off-server, encrypted.
- Restore: `pg_restore --clean --no-owner --dbname="$DATABASE_URL" backup.dump`.
- Backups contain personal data: restrict access and apply the same retention policy.

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

One Vercel project serves the built SPA and runs Django as a Python function (`api/index.py`,
settings `config.settings.vercel`) on the same domain. `vercel.json` routes `/api/*` to Django and
everything else to the SPA; functions run in Singapore (`sin1`).

1. **Supabase:** create a project in *Southeast Asia (Singapore)*. From *Connect*, copy the
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
strict limits. Reminders are generated whenever the app polls notifications, so no cron is required.

---

## Known limitations

- **Reminders are in-app only.** No email/SMS is sent; that needs an external provider (e.g. an email
  service or SMS gateway) and a scheduled worker calling it — not implemented.
- **Single-user design.** Each account sees only its own data; there are no teams, sharing or
  assigned users.
- **Stage list is fixed in code** (labels editable in `statuses.py`/`constants.ts`); sources and
  insurance categories are configurable in Settings.
- **No automatic retention purge**; the retention setting is informational.
- Calendar week view lists events per day rather than an hourly grid; drag-to-reschedule on the
  calendar is not implemented (use Reschedule).
- Pipeline drag-and-drop works with mouse/touch; keyboard users use the per-card **Move** menu.
- Gunicorn does not run on Windows; use `runserver` for local development and Linux for production.
- `PRU` in the product name may resemble a company brand — confirm naming is acceptable before
  wider use.
