# Local operation and recovery

Updated 10 October 2026 (Asia/Manila). Production deployment is excluded from this work.

## Monthly reporting

In **Staff → Reports**, select the month using the date filters. The monthly review lists every expected Sunday. An administrator can approve only a finished month with a service, attendance record and giving entry on every Sunday. Enter giving of `0` when no giving was received; an absent entry means unrecorded data. Approval locks service, attendance and giving changes, archives and imports for that month.

Approval saves a public snapshot, including the previous month and same month last year. Monthly XLSX and PPTX exports use that snapshot. Annual compilations reuse approved monthly snapshots alongside current drafts. Reopening allows corrections; existing exported copies remain available. Approval and reopening are audited.

**Preview monthly PowerPoint** shows six pages using the same content model as the generated PPTX: attendance numbers, attendance graph, attendance comparisons, giving numbers, giving graph and giving comparisons. It is a content preview, not a pixel-exact PowerPoint renderer.

The archive stores public XLSX/PPTX and staff XLSX/PDF exports in PostgreSQL, with a SHA-256 checksum verified again at download. Staff can see the latest 100 saved copies for the selected month. Downloads require both staff access and Google sign-in. Staff PDF/XLSX exports are current date-range reports; the approved snapshot applies to public monthly and annual reports. The archive distinguishes saved draft files from approved monthly snapshots.

Administrators can restore the latest 100 archived services from Reports, including their attendance and giving. Restoration cannot create a duplicate active Sunday or change an approved month.

## Historical import

An administrator downloads the XLSX template from Reports (Google sign-in required), fills one row per Sunday, then validates and previews the upload. Headers must match the template. Dates must be Sundays from 1990–2100; counts must be nonnegative whole numbers; giving supports two decimals. Blank attendance/giving means unrecorded; explicit zero is recorded. Formulas and rich-text cells are rejected. Maximum 1,000 service rows, 4 MB upload and 20 MB expanded ZIP content.

The preview identifies existing active dates and approved months. Import adds new records without overwriting old ones. The server validates again at save; a conflict rolls back the entire import.

## Password reset email

Staff login now links to `/admin/forgot-password`. Configure these values in the workspace's **`.env`**, then restart the app:

```dotenv
SMTP_HOST=your-mail-server
SMTP_PORT=587
SMTP_USER=your-mail-account
SMTP_PASSWORD=your-mail-password-or-app-password
MAIL_FROM=City Church of Christ <your-sender-address>
APP_URL=http://localhost:3000
```

Port 587 requires STARTTLS; port 465 uses TLS from connection start. Certificate validation stays enabled. A sender address and email provider are still needed for live delivery. These are separate from the Google OAuth credentials used for downloads.

Reset links expire in 30 minutes and can be used once. Only token hashes are stored. Successful reset revokes all staff sessions and outstanding reset links for that account. Account password/role/status changes by an administrator also invalidate outstanding reset links. Request responses do not disclose whether an email belongs to a staff account. Settings shows whether mail delivery variables are present; this does not confirm delivery.

## Database backups

Destination: **`C:\Users\ACER\Documents\churchbackup`**. The folder has been created and a real backup has been restored to a temporary database for verification. A Codex automation runs backup and verification daily at **8:00 PM Manila time**, quietly on success. The computer and Codex must be available for the automation to run; it reports failures or required action.

The commands are:

```powershell
npm run db:backup
npm run db:backup:verify
```

Backups are PostgreSQL custom-format dumps. A consistent exported database snapshot supplies both the dump and manifest table counts. Each manifest includes SHA-256 and size. Verification checks the checksum, restores into a fresh temporary database, compares table counts and removes that verification database. The latest 30 completed backups are retained; unrelated files are preserved. The script never logs database passwords or includes them in command arguments. Backups include private staff data and credentials stored by the application, so keep this folder private.

Override the defaults in `.env` if needed:

```dotenv
BACKUP_DIR=C:/Users/ACER/Documents/churchbackup
PG_BIN_DIR=C:/Program Files/PostgreSQL/18/bin
```

To recover into a **new** database while preserving the existing database:

```powershell
npm run db:restore -- --file=BACKUP_FILENAME.dump --target=ccoc_restore_recovered
```

`--file` must name a dump inside `BACKUP_DIR`. The target must be new and start with `ccoc_restore_`. The script checks the manifest and restored row counts, then invalidates restored staff sessions, Google sessions and reset tokens. It never switches the app's database automatically. After inspecting the recovered database, update `DATABASE_URL` and restart the app to use it. No live-database replacement was performed during this work.
