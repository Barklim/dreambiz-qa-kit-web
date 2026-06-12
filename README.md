# DreamBiz QA Reports — public site

Static site that publishes the QA report HTMLs. Visitors land on the **freshest**
report; a date `<select>` (sorted newest → oldest) lets them switch to older ones.

## Add a new report

1. Drop the HTML into [`reports/`](reports/), named with a date:
   `query1-dubai-YYYY-MM-DD.html` (the `YYYY-MM-DD` is what the build reads).
2. Commit & push (or re-deploy). That's it — no list to edit.

The build scans `reports/`, pulls the date from each filename and the title from
its `<title>`, sorts newest-first, and writes `dist/`.

## Local preview

```bash
npm run build      # → dist/
npm run preview    # build + serve dist/ at localhost
```

## Deploy (Netlify)

Two options:

- **Git:** connect this folder in app.netlify.com. Build command `npm run build`,
  publish dir `dist` (already set in [`netlify.toml`](netlify.toml)).
- **Drag & drop:** run `npm run build` locally, then drag the `dist/` folder onto
  app.netlify.com.

## How it renders

Each report is shown in an **iframe**, so its own `<style>` (own `:root`, body
padding, etc.) stays fully isolated from the site shell. Existing report files
work unchanged.

- Default view = newest report.
- `?r=<filename>` deep-links a specific report (the selector updates the URL).
- `manifest.json` is generated and served `no-cache`, so a new report appears
  immediately after deploy.

## Structure

```
reports/            source report HTMLs (the source of truth)
scripts/build.mjs   scan → manifest.json + index shell → dist/
netlify.toml        build command + publish dir
dist/               generated (gitignored)
```
