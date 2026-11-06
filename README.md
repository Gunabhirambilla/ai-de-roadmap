# AI Data Engineer Roadmap

An interactive, zoomable view of my 52-week AI data engineering roadmap. The source of truth is my Notion roadmap; this page redraws itself from it.

**Live page:** https://gunabhirambilla.com/ai-de-roadmap/

## How it updates

1. I update a week in Notion (Status, Actual Hours, Confidence).
2. Every day at 5:00 PM Eastern, the `Sync from Notion` GitHub Action runs `scripts/sync_notion.py`, which reads the Roadmap Tracker database and the skills table and writes `data.json`.
3. If anything changed, the action commits `data.json` and redeploys GitHub Pages.

For an instant refresh: **Actions → Sync from Notion → Run workflow**.

## One-time setup

1. **Notion integration.** Go to https://www.notion.so/profile/integrations, create an internal integration with *Read content* access, and copy its secret.
2. **Share the roadmap with it.** On the *AI Data Engineer Roadmap* page in Notion: `•••` → *Connections* → add the integration. Child pages and both databases inherit access.
3. **Repository secret.** In this repo: *Settings → Secrets and variables → Actions → New repository secret*, name `NOTION_TOKEN`, value = the integration secret.
4. **Pages source.** *Settings → Pages → Build and deployment → Source:* **GitHub Actions**.
5. Run the workflow once from the Actions tab.

## Using the page

- Drag to pan; pinch or Ctrl + scroll to zoom; double-click to zoom in.
- `+` / `−` / `0` zoom in, out, whole year. `T` jumps to this week. `←` `→` step through weeks.
- Zoom in past ~13 weeks and every week gets its own label; zoomed out you see the 8 phases.
- Drag the purple window on the overview strip to move around the year.
- Search, skill and status filters dim everything that doesn't match.
- Links like `#w12`, `#p3` or `#m2027-02` open straight to a week, phase or month.

## Files

| File | What it does |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The page. No build step, no dependencies. |
| `data.json` | Snapshot of the Notion roadmap, written by the sync. |
| `scripts/sync_notion.py` | Notion API → `data.json`. Python standard library only. |
| `.github/workflows/sync.yml` | Daily 5 PM Eastern sync, commit and Pages deploy. |

Run the sync locally with `NOTION_TOKEN=secret_xxx python scripts/sync_notion.py`.
