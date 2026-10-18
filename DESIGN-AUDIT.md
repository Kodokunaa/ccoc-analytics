# Design audit — 10 October 2026

The interface uses teal `#007F78`, white surfaces, and black text. Selected navigation and enabled primary actions use white text on teal. Orange is reserved for analytics and the original church logo.

| Pair | Contrast ratio |
| --- | --- |
| White on teal `#007F78` | 4.88:1 |
| White on analytics orange `#C44F00` | 4.70:1 |
| Black on white | 21:1 |

## Corrections

- Fixed staff sign-in overflow at narrow widths by allowing grid columns and the login card to shrink. Restored the space between words when its heading wraps on phones.
- Removed the travelling tab fill and background fade. Selection now changes instantly, keeping white labels on a solid teal background even during navigation.
- Enlarged filters, table actions, pagination and disclosure headers. Main interactive controls have at least 44px height; mobile form text uses 16px to avoid input zoom.
- Increased table and control typography, made the comparison selector span its own row on phones, and styled the dashboard's monthly report link as a consistent secondary action.
- Gave disabled primary actions a visible gray fill and black text. Enabled actions retain white text on teal.
- Added explicit accessible names to year, month, export and comparison selectors and generated staff dropdowns.

## Verification

Inspected public overview, monthly reports, service records, Google sign-in, staff sign-in/recovery and all ten current staff sections at 1440px, 390px and 320px. Additional states include export and user dialogs, custom dates, AI commentary, other export formats and the monthly PowerPoint preview.

The final rendered-text scan covered **66 states and 3,030 visible text nodes**, with **zero text contrast failures or horizontal page overflow**. The mobile scan found no visible controls below 32px height. Closed disclosure content and inaccessible modal backgrounds were excluded. Screenshots were inspected for hierarchy, spacing and wrapping. Automated browser checks also cover sign-in at 650px and tab changes with normal and reduced motion.

This audit covers rendered HTML text, responsive layout and core controls. Chart SVG labels, image pixels, full keyboard journeys and assistive-technology behavior are outside the contrast scanner's scope. Screenshots and scan output are stored in the ignored `test-results` directory.

Validation: lint and TypeScript checks passed; all 22 unit tests and 11 browser tests passed. Browser tests ran against an isolated temporary database.
Production build passed.

## Live website audit — 11 October 2026

Reviewed the deployed public overview, monthly reports, service records, comparison disclosure, export dialog, sign-in and recovery pages, plus the current staff sections at 1440px, 390px and 320px. Staff screenshots were captured after the loading placeholder cleared. Audit artifacts are in the ignored `test-results/live-audit` directory. No church records were created or modified by these checks.

Corrections:

- Empty trend charts now use a compact layout and neutral wording appropriate for guests as well as staff.
- Staff attendance and giving growth now show "No baseline" when either period lacks recorded data. Public giving comparisons and giving-per-attendee comparisons follow the same rule. An explicitly recorded zero remains valid data.
- Staff PDF chart labels use PHP instead of a peso glyph that the standard PDF font cannot render on Linux hosts without an additional font.
- The previous correction places the monthly comparison triangle at the right with 20px edge padding and a 16px text gap, preserving keyboard expansion.

Validation: lint, TypeScript and 23 unit tests passed, including a new regression covering missing giving versus explicit zero. The revised empty chart layout passed browser checks at all three widths. Live checks exercise administrator login/logout, export dialog Escape dismissal and the configured password-reset endpoint without sending email.

Operational follow-ups:

- Vercel authentication protection still restricts public access to the production URL. It must be removed when the church is ready for public viewing.
- A complete Google sign-in/download journey and actual Resend delivery still require verification with real accounts. The audit did not send email or call Manus.
- The local backup script loads `.env`; this audit does not establish that Supabase production backups are scheduled or that a production restore has been tested.
- Production currently has no service records, so charts containing real data and data-dependent report layout need a separate check once records are entered. Automated unit tests cover calculations and missing-data behavior.

The earlier contrast scan remains a separate result. This live audit checks responsive overflow, accessible control names, visible layouts and core navigation; it is not a complete WCAG or penetration-test certification.

## Separate analytics and PowerPoint reports — 11 October 2026

Attendance and giving now have independent analytics navigation entries, dashboard charts, monthly PowerPoint links and three-slide previews. PowerPoint selection survives Google sign-in and is validated by the export endpoint. Filenames identify the selected report. Monthly decks contain numbers, a native chart, and last-month/last-year comparisons; annual decks contain 36 slides for one selected report. Existing combined export archives are preserved.

Validation: 26 unit tests and all 11 browser tests passed against an isolated production build and temporary database over HTTPS. Additional checks exercised both selected downloads, preview isolation, invalid report rejection, Google authorization and responsive layouts at 1440px, 390px and 320px. PowerPoint rendered both sample decks, and all six slides were inspected. Arial avoids an unintended fallback for machines without Poppins. Corrected the narrow export-dialog frame and wrapped preview tables so their values remain visible on phones.

## Full application and export audit — 18 October 2026

Fixed findings:

- High priority: production public-schema tables had no RLS and granted direct access to Supabase `anon` and `authenticated`. The reproducible security migration enables default-deny RLS on 19 tables (including migration metadata), revokes direct client grants, and removes default client table grants. The server connection was confirmed to use a role with BYPASSRLS. This follows [Supabase's RLS and grant guidance](https://supabase.com/docs/guides/database/postgres/row-level-security). Exposure depended on whether the Data API was enabled; this audit does not establish that data was accessed.
- Missing attendance/giving previously entered weekly denominators, and missing offerings could lower the minimum giving to zero. Averages and minima now use records for the selected metric. Explicit zeros remain valid recorded data.
- Giving per attendee now uses services with both measurements, preventing unrelated Sundays from being combined. Unavailable ratios are labeled explicitly.
- Public overview, service/month tables, staff dashboard, and workbooks distinguish missing data from recorded zero. Attendance analytics omit giving-only services, and attendance breakdowns include unclassified people rather than silently dropping them.
- PowerPoint rejects the raw-data scope at the API boundary. Attendance slide counts identify services with attendance rather than all services.
- XLSX exports retain integer count formatting and two-decimal money formatting, preserve missing values and approved snapshots, and keep campaign amounts outside Sunday giving.
- Staff PDF identifies comparison dates, uses readable grouped charts for long ranges, avoids overlapping value labels, and consistently displays monetary decimals.
- Live verification found a production-only Prisma pool timeout in report previews: two full-year transparency loads ran concurrently against a one-connection pool. Report-source and workflow loads now avoid overlapping those query batches. This also protects monthly file generation, which uses the same source loader.

Validation:

- 35 unit tests, 11 browser tests, lint, type checking, and a production build passed. Browser tests ran on a temporary local database over HTTPS, covering staff roles, session revocation, reset tokens, OAuth state/PKCE, rate limits, approvals/locks, imports, and archives.
- Export matrix passed for raw/monthly/yearly XLSX, separate attendance/giving monthly and yearly PPTX, staff XLSX/PDF, archive byte restoration and corrupt-checksum rejection, invalid options, Google/staff download gates, and exclusion of private notes and campaign funds. Monthly PPTX has 3 slides; annual has 36. Native editable tables/charts were verified.
- Export samples were opened in native Excel and PowerPoint. Monthly slides, workbook summary rendering and both PDF pages were visually reviewed, including a 52-Sunday PDF range.
- All four public views, both export-dialog formats, and eleven admin sections passed overflow/navigation checks at 1440px, 390px and 320px. Synthetic incomplete data covered explicit zero and missing measurements.
- Production dependencies: npm audit reported no known vulnerabilities. This is a dependency scan, not a penetration-test certification.
- A production backup was created and restored into a temporary local verification database before the security migration. Production church records were not edited by audit fixtures.

Remaining limits and follow-ups:

- Capital campaign is viewable in public and staff sections but has no dedicated XLSX/PPTX export or editing form yet.
- Ledger discrepancies remain unresolved: campaign PHP 50 and June giving PHP 6. Figures were not changed to force agreement with handwritten subtotals.
- Real Google account consent/token exchange and actual Resend delivery were not exercised. Tests cover protocol protections, stored viewer sessions, and reset-token lifecycle. No email or live Manus request was sent.
- Vercel SSO protection is still configured for all deployments, including production, so ordinary guests may be stopped before reaching the app. Its policy was not relaxed during this audit.
- The Resend key previously pasted into chat should be rotated through Resend and replaced in the environment. The audit did not revoke active credentials.
- Automated backup configuration still points at the local `.env` database; the production backup above was explicitly selected. A recurring Supabase production-backup policy needs separate configuration.
