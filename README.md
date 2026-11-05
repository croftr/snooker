# Bob v Mike

The official record of a snooker rivalry running since 2005. Surviving records only.

Vite + React on the front, three small Vercel functions behind it, and one JSON file in S3 as the database.

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:5173. Locally the data lives in `data/local.json`, copied from `data/seed.json` the first time you run it, so nothing you do touches S3. Delete that file to start again.

To edit, click **Referee** in the top bar. Locally any password works unless you set `SNOOKER_EDIT_PASSWORD` in `.env.local`.

## Deploy

1. **Upload the data** (only once, because this overwrites whatever is there):

   ```bash
   aws s3 cp data/seed.json s3://robs-booky-data/snooker-data-v1.json --content-type application/json
   ```

2. **Allow the new file in IAM.** Use a key that can read and write the data file and write photos. Booky's key is scoped to booky's own file and `images/*`, so it needs this extra permission, or use a new key:

   ```json
   {
     "Effect": "Allow",
     "Action": ["s3:GetObject", "s3:PutObject"],
     "Resource": [
       "arn:aws:s3:::robs-booky-data/snooker-data-v1.json",
       "arn:aws:s3:::robs-booky-data/images/snooker/*"
     ]
   }
   ```

3. **Import the repo into Vercel** (it detects Vite) and set these environment variables:

   | Name | Value |
   |---|---|
   | `SNOOKER_EDIT_PASSWORD` | The referee password. Without it, all edits are refused |
   | `SNOOKER_AWS_ACCESS_KEY_ID` | From step 2 |
   | `SNOOKER_AWS_SECRET_ACCESS_KEY` | From step 2 |
   | `SNOOKER_S3_BUCKET` | Optional, defaults to `robs-booky-data` |
   | `SNOOKER_AWS_REGION` | Optional, defaults to `eu-west-2` |

To try the real S3 file from your machine, put the same values in `.env.local` and add `FORCE_CLOUD=1`.

## Using it offline

Open the site once with a connection on each phone, ideally adding it to the home screen, and it will then work with no signal.

- **The app and photos** are kept on the device by a service worker (`sw/sw.js`). Service workers only run in the built site, not in `npm run dev`.
- **Edits** save to the device straight away (`src/lib/store.tsx`) and sync by themselves when there's a connection: right after an edit, every 30 seconds, and when the app reopens. The yellow button in the header shows what's waiting and syncs on demand.
- **Photos** added offline are kept on the device and uploaded on the next sync.
- **The password** can't be checked offline, so it's checked at the next sync. If it's wrong, nothing syncs and the edits stay safe until the right one is entered.
- **Clashes:** if the site changed while a device had unsynced edits, a banner asks which version to keep, because the whole file gets replaced either way. This shouldn't normally come up.

To test the real offline build locally, run `npm run dev` in one terminal, and `npm run build` then `npm run preview` in another. Open the preview URL once, then stop the preview server and reload.

## How it works

- **Storage:** `server/store.ts` reads and writes `snooker-data-v1.json`, the same pattern as booky. Saves use S3's `If-Match`, so an out-of-date device can't overwrite newer data without asking. Booky's bucket versioning means old versions can be recovered.
- **Totals are never stored.** Scores, league tables, winners and stats are all worked out from the sessions in `src/lib/stats.ts`. Fix a session and everything follows.
- **Photos:** the originals are in `public/photos`. New ones go to `images/snooker/` in the bucket, resized in the browser first.
- **Reading is open, editing needs the password.** Anyone with the URL can read the site.
- **Change log:** every edit is recorded in the data file with the time it was made, shown on `/log` to the referee (`src/lib/changes.ts`). It lives in the same public file as the scores, so it's hidden from the menu, not secret.

## Where things are

| Path | What |
|---|---|
| `src/pages` | Home, Tournament, Rules, Hall of Fame |
| `src/components/SessionModal.tsx` | Logging and fixing sessions |
| `src/lib/stats.ts` | All the scoring logic |
| `server/`, `api/` | Storage and the Vercel functions |
| `data/seed.json` | The spreadsheet, converted |
