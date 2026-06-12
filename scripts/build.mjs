// Build step for the DreamBiz QA report site.
//
// Workflow: drop a report HTML into reports/ named `*-YYYY-MM-DD.html`, then run
// this script (Netlify runs it automatically on deploy). It:
//   1. scans reports/ for *.html
//   2. derives { date, file, title } from each (date from the filename, title from <title>)
//   3. sorts newest-first
//   4. copies everything into dist/ (reports + index shell + manifest.json)
//
// No manual list to maintain — the folder IS the source of truth.

import { readdir, readFile, writeFile, mkdir, copyFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const reportsDir = join(root, "reports");
const distDir = join(root, "dist");
const distReportsDir = join(distDir, "reports");

// Matches a YYYY-MM-DD anywhere in the filename (e.g. query1-dubai-2026-06-12.html).
const DATE_RE = /(\d{4}-\d{2}-\d{2})/;
const TITLE_RE = /<title>([\s\S]*?)<\/title>/i;

const decodeEntities = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;|&#8212;/g, "—")
    .trim();

async function main() {
  const entries = (await readdir(reportsDir)).filter((f) => f.endsWith(".html"));

  if (entries.length === 0) {
    throw new Error(
      `No reports found in ${reportsDir}. Add at least one *-YYYY-MM-DD.html file.`,
    );
  }

  const reports = [];
  for (const file of entries) {
    const html = await readFile(join(reportsDir, file), "utf8");

    const dateMatch = file.match(DATE_RE);
    if (!dateMatch) {
      console.warn(`⚠  Skipping "${file}" — no YYYY-MM-DD in filename.`);
      continue;
    }
    const date = dateMatch[1];

    const titleMatch = html.match(TITLE_RE);
    const title = titleMatch ? decodeEntities(titleMatch[1]) : file;

    reports.push({ date, file, title });
  }

  // Newest first. Ties (same date) fall back to filename desc so a "(repeat)"
  // run sitting next to its baseline is deterministic.
  reports.sort((a, b) =>
    a.date === b.date ? b.file.localeCompare(a.file) : b.date.localeCompare(a.date),
  );

  // Fresh dist.
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distReportsDir, { recursive: true });

  // Copy report files verbatim — they stay self-contained, rendered in an iframe.
  for (const r of reports) {
    await copyFile(join(reportsDir, r.file), join(distReportsDir, r.file));
  }

  await writeFile(
    join(distDir, "manifest.json"),
    JSON.stringify({ reports, generatedAt: new Date().toISOString() }, null, 2),
  );

  await writeFile(join(distDir, "index.html"), shellHtml());

  console.log(`✓ Built ${reports.length} report(s) → dist/`);
  console.log(`  Latest: ${reports[0].date} (${reports[0].file})`);
}

function shellHtml() {
  // Self-contained shell: a fixed header with the date <select>, an iframe below.
  // It reads manifest.json at runtime, so adding a report never touches this file.
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DreamBiz QA Reports</title>
  <style>
    :root {
      --bg: #0f1117; --surface: #1a1d27; --border: #2a2f3d;
      --text: #e8eaed; --muted: #9aa0a6; --accent: #5b9fd4;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg); color: var(--text);
      display: flex; flex-direction: column;
    }
    header {
      flex: 0 0 auto;
      display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
      padding: 0.75rem 1.25rem;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      position: sticky; top: 0; z-index: 10;
    }
    header .brand { font-weight: 700; font-size: 0.95rem; }
    header .brand span { color: var(--muted); font-weight: 400; }
    .spacer { flex: 1 1 auto; }
    label { font-size: 0.8rem; color: var(--muted); }
    select {
      background: var(--bg); color: var(--text);
      border: 1px solid var(--border); border-radius: 6px;
      padding: 0.4rem 0.6rem; font-size: 0.85rem; cursor: pointer;
      min-width: 220px;
    }
    select:focus { outline: 1px solid var(--accent); }
    .latest-badge {
      font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.04em;
      color: var(--accent); border: 1px solid var(--accent);
      border-radius: 4px; padding: 0.1rem 0.4rem;
    }
    .frame-wrap { flex: 1 1 auto; position: relative; }
    iframe { width: 100%; height: 100%; border: 0; background: var(--bg); display: block; }
    .empty { padding: 2rem; color: var(--muted); }
  </style>
</head>
<body>
  <header>
    <div class="brand">DreamBiz QA <span>· Query #1 Dubai</span></div>
    <div class="spacer"></div>
    <label for="report-select">Отчёт по дате:</label>
    <select id="report-select" aria-label="Выбор отчёта по дате"></select>
    <span class="latest-badge" id="latest-badge" hidden>latest</span>
  </header>
  <div class="frame-wrap">
    <iframe id="report-frame" title="QA report" referrerpolicy="no-referrer"></iframe>
  </div>

  <script>
    (async function () {
      const select = document.getElementById("report-select");
      const frame = document.getElementById("report-frame");
      const badge = document.getElementById("latest-badge");

      let manifest;
      try {
        const res = await fetch("manifest.json", { cache: "no-store" });
        manifest = await res.json();
      } catch (e) {
        document.querySelector(".frame-wrap").innerHTML =
          '<div class="empty">Не удалось загрузить manifest.json</div>';
        return;
      }

      const reports = manifest.reports || [];
      if (!reports.length) {
        document.querySelector(".frame-wrap").innerHTML =
          '<div class="empty">Нет отчётов.</div>';
        return;
      }

      // manifest is already sorted newest-first.
      reports.forEach((r, i) => {
        const opt = document.createElement("option");
        opt.value = r.file;
        opt.textContent = r.date + (i === 0 ? "  (свежий)" : "");
        opt.dataset.index = String(i);
        select.appendChild(opt);
      });

      function show(file, index) {
        frame.src = "reports/" + file;
        badge.hidden = index !== 0;
      }

      // Deep-link: ?r=<file> wins, else default to the freshest (index 0).
      const params = new URLSearchParams(location.search);
      const requested = params.get("r");
      const startIdx = requested
        ? Math.max(0, reports.findIndex((r) => r.file === requested))
        : 0;

      select.selectedIndex = startIdx;
      show(reports[startIdx].file, startIdx);

      select.addEventListener("change", () => {
        const idx = Number(select.selectedOptions[0].dataset.index);
        show(reports[idx].file, idx);
        const url = new URL(location.href);
        url.searchParams.set("r", reports[idx].file);
        history.replaceState(null, "", url);
      });
    })();
  </script>
</body>
</html>
`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
