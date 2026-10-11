# City Church of Christ — application audit

## Follow-up completed — 10 October 2026

Google sign-in and download access are confirmed by the user. Production deployment is excluded. The follow-up adds Sunday-only database validation and active-date uniqueness, monthly completeness checks, administrator approval/reopening with transaction-protected month locks and frozen public snapshots, archive restoration, quarterly/yearly charts, shared-model PPTX previews, saved export archives, atomic historical XLSX import, and email reset-token handling. Daily backups are saved to `C:\Users\ACER\Documents\churchbackup` with checksums and verified restoration into a temporary database. Details and mail setup are in [OPERATIONS.md](OPERATIONS.md).

Validation passed: lint, TypeScript, 18 unit tests, all seven browser/API tests, the optimized production build, and backup/restore verification. Live reset-email delivery still needs an email provider, sender and SMTP credentials. Reset expiry, one-use handling and session revocation are tested locally. The later palette and contrast evidence are in [DESIGN-AUDIT.md](DESIGN-AUDIT.md); the findings below retain the earlier audit history.

Audit date: 6 October 2026 (Asia/Manila).

Subsequent scope changes removed service-type controls and giving categories. Migration `20261006120000_remove_giving_categories` removes category storage while preserving all giving records and amounts; the local before/after check confirmed eight records totaling PHP 29,753.00. Category-related findings below describe the earlier audit implementation and are historical.

Reviewed public and staff routes, Google and password authentication, session handling, role checks, mutations, validation, database queries and indexes, attendance/giving calculations, XLSX/PDF/PowerPoint generation, client rendering, responsive layout, and dependencies. This is a local source and regression audit, not an independent penetration test or a hosted infrastructure review.

## Findings fixed

| Finding                                                                   | Change                                                                                                                                                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Concurrent downloads could bypass a count-after-generation limit          | Atomic PostgreSQL reservations shared by public and staff downloads; ten valid export attempts per Google viewer per minute. Reservations happen before expensive generation.  |
| Login attempt reservation used multiple read/write steps                  | Atomic per-account reservations; eight attempts per fifteen minutes, with UTC expiry independent of database timezone. Expired throttle rows are periodically removed.         |
| Some mutation failures returned raw database errors                       | Public responses expose validation messages and a small set of safe business errors; unexpected failures use a generic message. Serialization conflicts ask the user to retry. |
| Report dates could normalize invalid dates such as February 30            | Shared strict calendar validation, with supported years 1990–2100.                                                                                                             |
| New long passwords could exceed bcrypt's input limit                      | New and reset passwords are limited to 72 UTF-8 bytes; existing login behavior remains compatible.                                                                             |
| Attendance targets could be fractional and money targets silently rounded | Attendance targets require whole numbers; targets require at most two decimal places.                                                                                          |
| Missing attendance could appear as a numeric decline                      | Public attendance growth needs recorded attendance in both periods; staff reports also guard missing baselines.                                                                |
| Decimal giving additions accumulated floating-point noise                 | Core summaries and weekly/monthly series add integer cents; currency formatting reuses one formatter.                                                                          |
| Large arrays could exceed JavaScript's argument limit in min/max calls    | Extrema use reductions instead of spreading all records into function arguments.                                                                                               |
| Monthly API summaries duplicated raw service records                      | Raw records are transmitted once; monthly summaries contain metrics only.                                                                                                      |
| Metadata loaded every historical service date                             | Database aggregation returns one row per year. Last-update metadata includes attendance, giving, categories, branding, and archives.                                           |
| Staff pages always fetched user lists and 500 audit entries               | Section-specific requests fetch these only for their respective administration pages; explicit no-store headers protect staff responses.                                       |
| Repeated authentication checks loaded password hashes unnecessarily       | Minimal field selection and request-local memoization; fresh database checks remain in place across requests.                                                                  |
| Category validation issued one query per giving entry                     | One query checks all distinct category IDs. Password hashing also runs before the write transaction to reduce time holding database locks.                                     |
| Charts increased loading and recalculation on unrelated interactions      | Chart components load separately on demand; summaries and chart series use memoized inputs.                                                                                    |
| Export libraries loaded before checking download permissions             | XLSX, PDF, and PowerPoint generators load only for the requested format after authentication, validation, and export-limit checks.                                              |
| Staff defaults were permanently January 2026                              | Initial staff date filters use the latest active service month, or the current month for an empty database.                                                                    |
| PDF colors differed from the app and secondary text was faint             | PDF exports share the app palette (now orange and teal); key secondary text on light surfaces has stronger contrast.                                                                            |
| Future environment files could be tracked accidentally                    | Ignore `.env.*` while retaining `.env.example`.                                                                                                                                |

Added indexes on throttle expiry and active-service date lookup. Migration: `20261005123735_audit_query_indexes`.

## Measured optimization

For `/api/transparency?year=2026`, with the four seeded January 2026 services, the uncompressed JSON response decreased from **12,829 to 9,727 bytes (24.2%)**. Totals remain attendance **223** and giving **PHP 13,475**. This measures payload size, not real-user page latency; it is not a load-test result.

## Validation

Passed: lint, TypeScript, 13 unit tests, five browser/API tests, and the production build. `npm audit` reported zero known dependency vulnerabilities. A scan of production client JavaScript found none of the configured AUTH_SECRET, admin password, or Google client secret values.

A production-server smoke check returned 200 for public pages/data, 401 for anonymous private data and downloads, and a staff-login redirect for `/admin/dashboard`.

Regression coverage includes private-route and role restrictions, Google viewers having no staff permissions, session revocation, origin checks, CRUD rollback/validation, strict dates, Google nonce/email/return-path checks, login throttling, simultaneous export requests, expired-limit reset, and shared public/staff export limits. Export tests inspect PDF, XLSX sheets, native PPTX charts, six-slide monthly order, and 72-slide annual output. Browser checks cover desktop/mobile layouts and chart loading.

The configured Google redirect/cancellation/state-replay flow is checked without contacting the token endpoint or signing into a human account. Actual Google consent, token exchange, and a real user session require an interactive verification.

## Remaining deployment considerations

- Set production `APP_URL` to the HTTPS site origin and register its exact Google callback URL. The local environment currently defaults to `http://localhost:3000`.
- Staff analytics still load active service history for filtering. For a substantially larger dataset, move staff filters and pagination to server queries; public queries are already limited to a selected year plus its December baseline.
- Exports generate files in server memory. Per-viewer limits reduce abuse, but a high-volume deployment should add global request/concurrency limits and background report jobs.
- Add hosting-level IP throttling, request-size limits, TLS configuration, backups, monitoring, and a log/session-retention policy. These cannot be verified from the local app alone.
- Review the seeded development records before publishing transparency data. Production seeding should use `SEED_SAMPLE_DATA=false` when example records are not intended.
- The contrast and keyboard changes are targeted improvements, not a full accessibility certification.

See README.md for setup, deployment, and the commands used to verify the application.
