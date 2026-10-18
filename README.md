# City Church of Christ — Church Performance Analytics

A full-stack application for service records, attendance, Philippine Peso giving, leadership analytics, targets, reports, users, and audit history.

## Features

- Separate public Capital campaign view with monthly faith pledge entries and prior-year savings. These amounts never contribute to Sunday giving totals or exports.

## Importing the supplied 2026 ledger

Run migrations first, then `npm run db:seed:ledger -- --env-file=.env.production` to preview and add `--apply` to import. This dedicated import does not change passwords or run development sample seeds. It creates nine attendance records and twelve independent campaign entries, logs the additions, and skips identical records on rerun. Conflicts roll back the entire import. Unknown attendance breakdowns remain unclassified; visitor names are not imported.

The supplied campaign items total PHP 61,100, while the handwritten total states PHP 61,150. The app displays this unresolved PHP 50 discrepancy without creating a balancing transaction. Prior-year savings total PHP 19,114, giving a calculated balance of PHP 80,214.

Database backups and restores cover the app's `public` schema. Supabase-managed schemas and extensions are excluded so the app data can be verified in a temporary local PostgreSQL database.

## Application features

- Responsive dashboard, collapsible mobile navigation, filters, search, tables, pagination, loading and empty states.
- Email/password authentication with bcrypt, opaque database sessions, HTTP-only cookies, logout and account-level login throttling.
- Live role checks, inactive account blocking, session revocation on user changes, and origin checks for mutations.
- Service entry with optional attendance and giving saved in one database transaction. Separate attendance and giving editing.
- Giving is recorded as amounts and optional private notes; category fields, filters, management, and category charts are removed. Existing amounts are preserved by migration.
- Sunday-service-only workflow: service-type selectors and filters are removed; new records default to Sunday service.
- Direct Monthly PowerPoint export from the public page, each monthly report row, and staff Reports. Select a month to export its three-slide attendance or giving report; Google sign-in is required.
- Separate Attendance analytics and Giving analytics pages with weekly/monthly trends, previous month/year and custom comparisons. Attendance includes member/visitor and adult/child breakdowns.
- One active service per Sunday, enforced by the database. Monthly completeness checks distinguish missing attendance/giving from explicitly recorded zero.
- Staff Reports supports administrator approval and locking, reopening for corrections, separate three-slide attendance and giving PowerPoint content previews, saved XLSX/PPTX/PDF export copies with checksums, and administrator restoration of archived services.
- Historical XLSX import with a template, row validation, conflict preview and an atomic save. Imports add records without overwriting existing Sunday dates.
- Email password reset links with 30-minute expiry, one-use tokens, request throttling and session revocation. Email transport must be configured.
- Targets with actual versus goal calculations over the target's date window.
- PDF reports with vector charts, Excel workbooks with Summary/Attendance/Giving sheets, and browser print layout.
- User creation, editing, role/status changes and password resets; church settings.
- Audit entries for login, logout, writes, archives, and report exports. Passwords and password hashes are excluded from responses and audit entries.

## Stack

Next.js 16 App Router, React, strict TypeScript, Tailwind CSS 4, Recharts, Lucide, PostgreSQL, Prisma 6, Zod, bcryptjs, ExcelJS, and PDFKit. Authentication uses server-side database sessions with random tokens stored as SHA-256 hashes. AUTH_SECRET is used to derive session tokens.

## Prerequisites

- Node.js 22.13+ (Node 24 recommended).
- PostgreSQL 16+ with an application database and credentials.
- Windows, macOS, or Linux. For PDF Peso glyphs, Windows Arial is detected; other hosts can configure a TrueType font as described below.

## Installation

```powershell
npm ci
Copy-Item .env.example .env
```

Edit `.env`. Supply a PostgreSQL connection string, a randomly generated AUTH_SECRET of at least 32 characters, ADMIN_EMAIL, and ADMIN_PASSWORD of at least 12 characters. Never commit `.env`.

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npx prisma generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000 for public transparency. Staff sign in at http://localhost:3000/admin/login with ADMIN_EMAIL / ADMIN_PASSWORD; their dashboard is under `/admin/dashboard`. Public navigation does not expose staff access, and signup is removed. Seeding preserves existing accounts and records; changing ADMIN_PASSWORD in `.env` does not reset an existing account. Reset an account through the Users page.

This workspace has a separate local PostgreSQL cluster in `.postgres`, bound to `127.0.0.1:5433`, and generated development credentials in the ignored `.env`. It does not alter the pre-existing PostgreSQL service on port 5432. To restart the local database on this Windows computer:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' -D "$PWD\.postgres" -l "$PWD\.postgres\server.log" -o '-p 5433 -h 127.0.0.1' start
```

To stop that local cluster:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' -D "$PWD\.postgres" stop
```

## Public transparency and Google downloads

Guests can view attendance, giving, service records, and monthly comparisons without an account. Public responses and workbooks omit private notes, staff identities, accounts, targets, and audit logs. Comparisons use the immediately preceding calendar month, including December for January; missing prior records show no baseline.

XLSX and PowerPoint downloads require the separate Google sign-in at `/signin`. Export a selected month's data, a monthly report with comparisons, or an annual workbook with an annual summary and twelve monthly report sheets. PowerPoint exports attendance and giving as separate files. Each report contains numbers, a graph, and a comparison, with one set of data per slide. Each comparison uses the previous month and the same month last year. An annual PowerPoint repeats the selected report’s three slides for each month (36 slides total). Native tables and charts are editable. Staff PDF, Excel, and print controls also require Google sign-in. Google viewer accounts and sessions are separate from staff accounts and grant no administration permissions. Export requests are authorized on the server and recorded in PublicExportLog.

Create a Web application OAuth client in Google Cloud, configure its consent screen, and register `http://localhost:3000/api/google/callback` as an authorized redirect URI. If the consent screen is in testing, add the intended Google accounts as test users. Put GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the ignored `.env`, set APP_URL to `http://localhost:3000`, and restart the app. Production must use its HTTPS origin with the matching `/api/google/callback` redirect URI. The flow requests only `openid email profile`, with state, nonce, PKCE, verified Google ID tokens, and HTTP-only session cookies. No Drive permissions are requested.

Until credentials are configured, public viewing works and sign-in explains that downloads are awaiting setup. Keep the client secret server-side; never use a NEXT_PUBLIC variable for it.

## Environment variables

| Variable             | Purpose                                                                               |
| -------------------- | ------------------------------------------------------------------------------------- |
| DATABASE_URL         | PostgreSQL connection string, with URL-encoded credentials                            |
| AUTH_SECRET          | At least 32 random characters; required for session creation                          |
| APP_URL              | Canonical application origin; localhost:3000 by default, HTTPS required in production |
| GOOGLE_CLIENT_ID     | Google Web application OAuth client ID                                                |
| GOOGLE_CLIENT_SECRET | Server-only Google OAuth client secret                                                |
| ADMIN_EMAIL          | Initial admin email, read only by seed and development tests                          |
| ADMIN_PASSWORD       | Initial admin password, at least 12 characters                                        |
| REPORT_FONT_PATH     | Optional absolute TrueType font path supporting the Peso glyph                        |
| TRUST_PROXY          | Set to `true` only behind a proxy that overwrites X-Forwarded-For                     |
| SEED_SAMPLE_DATA     | `true` seeds the example services; `false` creates accounts and settings only         |

Default settings use City Church of Christ, PHP, Asia/Manila, and Sunday service. No physical address or logo is invented.

## Database and migrations

Normalized tables: User, Role, Session, LoginAttempt, Service, AttendanceRecord, GivingRecord, Target, AuditLog, AppSetting, GoogleViewer, GoogleViewerSession, and PublicExportLog. One attendance record per service; multiple giving records per service are allowed, without categories. Money is stored as PostgreSQL Decimal(14,2). Service dates and target dates use database DATE columns. Timestamp displays use Asia/Manila; DATE values are treated as calendar dates. Calculations are derived from raw records. Soft-archived services are excluded from analytics and reports; audit history remains.

The checked-in initial migration creates relations and indexes. For schema changes in development:

```powershell
npx prisma migrate dev --name describe_your_change
```

For deployment use `npm run db:migrate`. The seed inserts eight supplied sample services in January 2025/2026. Sample demographic counts remain unspecified (zero) rather than invented.

## Roles

The simplified workspace keeps the dashboard to four totals and separate attendance and giving charts. Monthly Reports has one month/year selector, separate attendance/giving PPTX links and previews, XLSX downloads, and the Sunday review. AI commentary, saved files, restoration, imports, and other export formats are expandable tools. Public Overview no longer repeats the service table; records have their own tab and all exports use one dialog. Analytics has separate Attendance analytics and Giving analytics navigation entries. The legacy combined-analysis URL redirects to Attendance analytics. Existing records and archived exports are preserved. Goals remain outside the main navigation. Print and duplicate quarterly/yearly chart panels were removed from the interface.

| Role        | Permissions                                                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| SUPER_ADMIN | All records, targets, exports, users/roles, audit history, settings                                                                                   |
| ENCODER     | Read dashboard and analytics; create records; edit services they created and their related attendance/giving; no archive, user management or settings |

New staff accounts are automatically assigned ENCODER. User management has no role selector and cannot create additional administrators; existing administrator roles are preserved on edit. Administrators and encoders use `/admin/login`. Google-signed-in users are public viewers with report-download access, and never receive staff access. Guests can browse public data without signing in. Legacy staff VIEWER accounts cannot sign in or use existing staff sessions.

All mutation permissions are checked on the server. Admin accounts cannot demote or deactivate themselves. User edits revoke existing sessions, including password resets.

## Calculation conventions

Attendance totals sum recorded attendance; per-service averages exclude missing attendance and include recorded zero. Weekly averages divide by distinct weeks with service records (Monday through Sunday). Giving averages divide by service count. Giving per attendee divides total giving by total attendance. Growth is `(current − comparison) / comparison × 100`; positive current values with a zero baseline show “No baseline”. Target attendance means cumulative attendance over its date range. Missing demographic breakdowns are not assumed to be members/adults.

January 2026 verification: attendance 223, per-service average 55.75, peak 67, lowest 41, growth 11.5%; giving ₱13,475, per-service average ₱3,368.75, growth approximately −17.22%, per attendee approximately ₱60.43.

## Checks

```powershell
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npx playwright test
npm run build
```

Browser tests require the development database and seed, log in using the environment credentials, exercise CRUD/validation/origin checks/roles/inactive sessions, inspect PDF and workbook exports, visit every page, and check mobile navigation and overflow. Run them against a development database; they write temporary test records and audit events. Screenshots go into the ignored `test-results` directory.

## Production build and deployment

See [AUDIT.md](AUDIT.md) for the application audit, measured improvements, regression coverage, and remaining deployment considerations.

```powershell
npm ci
npx prisma generate
npm run db:migrate
npm run build
npm start
```

Deploy to a Node.js server or compatible Next.js host connected to a managed PostgreSQL database. Configure real environment variables and a HTTPS reverse proxy. Production session cookies are Secure; plain HTTP production logins will not persist. PDF currency labels use PHP so they render with the bundled standard font; REPORT_FONT_PATH can optionally select a host-installed font. Ensure the public origin received by Next.js matches your proxy's forwarded host/protocol configuration. Only enable TRUST_PROXY when that proxy overwrites forwarded IP headers.

Use a separate database for production. Set `SEED_SAMPLE_DATA=false` before running `npm run db:seed` to create the initial admin, roles, and settings without example service data. Back up PostgreSQL, restrict database access, and configure log retention at the host.

The current API loads the church's active service history for client-side filtering; this is suitable for a small church dataset. For large multi-year datasets, introduce query-level pagination and aggregate endpoints. The Audit Logs UI shows the latest 500 events while the full history is retained. Account login throttling is stored in PostgreSQL; an upstream IP limiter should be configured on an internet-facing host. This project has been verified locally; hosted deployment and infrastructure review remain deployment responsibilities.
