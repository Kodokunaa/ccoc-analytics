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
