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
