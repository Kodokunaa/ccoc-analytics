# UI and monthly commentary integrations

Anime.js animates public KPI card entrances without changing displayed totals. Motion animates the selected public tab and PowerPoint preview transitions. Both honor reduced-motion preferences; data remains readable without animation. Bklit UI's linear gauge shows complete Sunday records in the staff monthly review. The gauge source is vendored under `components/bklit` with its MIT license; imports and React entrance state were adapted for this app. The existing reporting charts remain available.

Sources: [Anime React integration](https://animejs.com/documentation/getting-started/using-with-react/), [Motion accessibility](https://motion.dev/docs/react-use-reduced-motion), [Bklit gauge](https://bklit.com/docs/components/gauge-chart), [Bklit source and license](https://github.com/bklit/bklit-ui).

## Enable Manus

Create a key in Manus's developer settings, then add it to the repository's local `.env`:

```dotenv
MANUS_API_KEY=your_key_here
```

Restart the app with `npm run dev`. This key stays on the server. Do not prefix it with `NEXT_PUBLIC_`, commit it, or paste it into chat. [Manus authentication documentation](https://open.manus.im/docs/v2/authentication).

Open the private staff Reports page and select a month. Administrators can choose **Draft with Manus** and confirm transmission. The app sends only public attendance and giving aggregates, completeness information, and comparisons with the previous month and same month last year. It excludes notes, service names, staff identities and credentials. Approved months use the existing frozen report snapshot.

The app uses the Manus v2 `task.create` API with a private, non-interactive lite task and structured output. **Check progress** retrieves the structured result; it does not create another task. All staff can read saved drafts. An administrator handles generation and progress checks. Drafts are stored with the input snapshot and labeled for staff review. They are not automatically approved, added to public pages or inserted into exports. The API key does not need to be configured for any other app feature.

An active task reserves its month to prevent concurrent creation. Generation is limited to five attempts per administrator per hour. Progress checks have a ten-second minimum interval. If creation times out, the app preserves an unconfirmed reservation. Check the Manus account before releasing it; releasing a reservation does not cancel an external task or reverse its charges. Background output can still be arriving after Manus reports the agent stopped. Tasks needing interaction must be handled in Manus.

Monthly task snapshots and drafts are included in database backups. Previous backups created before this table was added do not contain this feature's data. A live provider run requires a configured key and may use Manus credits; development tests mock the provider instead of spending credits.
