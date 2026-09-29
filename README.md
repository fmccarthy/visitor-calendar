# Visitor Calendar

A tiny static site that reads visitor/talk info from a Google Sheet and shows
it as a calendar. No backend, no login, no build step — just HTML/CSS/JS.

## 1. Create the Google Sheet

Make a new Google Sheet with a header row using exactly these column names
(only **Name** and **Start Date** are required — leave the rest blank when
not needed):

| Name | Start Date | End Date | Talk Title | Talk Date | Talk Time | Notes |
|------|-----------|----------|------------|-----------|-----------|-------|
| Jane Smith | 2026-10-06 | 2026-10-10 | Cosmic dust and you | 2026-10-08 | 2:00pm | Room 301 |
| Alex Lee | 2026-10-13 | | | | | |

Notes:
- Dates can be typed as `2026-10-06` or `10/6/2026` — Sheets will format them
  however your locale does, either works.
- `End Date` blank = a single-day visit.
- `Talk Date` blank but `Talk Title` filled = assumes the talk is on the
  start date.

Then share it: **Share → General access → Anyone with the link → Editor**.
That's the link you'll hand out to the group so people can add visitors
directly in the sheet — no login on the website needed.

Grab the **Sheet ID** from the URL:
`https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`

## 2. Configure the site

Edit `config.js`:

```js
const CONFIG = {
  SHEET_ID: "paste the ID here",
  SHEET_NAME: "Sheet1",       // the tab name at the bottom of the sheet
  SHEET_EDIT_URL: "https://docs.google.com/spreadsheets/d/.../edit", // optional
  GROUP_NAME: "Your Group's Visitor Calendar",
};
```

## 3. Try it locally

```bash
cd visitor-calendar
python3 -m http.server 8000
```

Open http://localhost:8000

## 4. Publish with GitHub Pages

```bash
git init
git add .
git commit -m "Initial visitor calendar"
gh repo create visitor-calendar --public --source=. --remote=origin --push
```

Then in the repo on GitHub: **Settings → Pages → Source → Deploy from a
branch → `main` / `(root)`**. GitHub gives you an `https://` URL within a
minute or two.

## How it works

- The site fetches the sheet's published CSV export
  (`.../gviz/tq?tqx=out:csv&sheet=...`) on load and every 5 minutes after.
- No API key or Google Cloud project needed — this works because the sheet
  is shared as viewable via link.
- Editing only happens in the Google Sheet itself; the site is read-only.
