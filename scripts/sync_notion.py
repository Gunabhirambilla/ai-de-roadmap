#!/usr/bin/env python3
"""Pull the AI Data Engineer Roadmap from Notion and write data.json.

Reads every row of the Roadmap Tracker database and the "Where you are today"
skills table on the roadmap page. Uses only the standard library.

Environment:
  NOTION_TOKEN     Notion internal integration secret (required)
  NOTION_DB_ID     Roadmap Tracker database id (default below)
  NOTION_PAGE_ID   Roadmap page id, for the skills table (default below)
  OUT              Output path (default: data.json next to the repo root)
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = "https://api.notion.com/v1"
VERSION = "2022-06-28"
DB_ID = os.environ.get("NOTION_DB_ID", "40385ceaaf804e039ce166470e3241c2")
PAGE_ID = os.environ.get("NOTION_PAGE_ID", "3f093ebae4ea81df8a17c98fe1486406")
OUT = Path(os.environ.get("OUT", Path(__file__).resolve().parent.parent / "data.json"))


def call(method, path, token, body=None, tries=4):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        API + path,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Notion-Version": VERSION,
            "Content-Type": "application/json",
        },
    )
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < tries - 1:
                time.sleep(2 ** attempt)
                continue
            detail = e.read().decode(errors="replace")[:400]
            raise SystemExit(f"Notion API {method} {path} failed: {e.code} {detail}")


def plain(rich):
    return "".join(part.get("plain_text", "") for part in rich or []).strip()


def prop(props, name, kind):
    p = props.get(name) or {}
    v = p.get(p.get("type", kind))
    if v is None:
        return None
    if kind in ("title", "rich_text"):
        return plain(v) or None
    if kind == "select":
        return v.get("name")
    if kind == "multi_select":
        return [o["name"] for o in v]
    if kind == "date":
        return {"start": v.get("start"), "end": v.get("end")}
    return v  # number


def fetch_items(token):
    items, cursor = [], None
    while True:
        body = {"page_size": 100}
        if cursor:
            body["start_cursor"] = cursor
        res = call("POST", f"/databases/{DB_ID}/query", token, body)
        for page in res["results"]:
            if page.get("archived") or page.get("in_trash"):
                continue
            pr = page["properties"]
            dates = prop(pr, "Dates", "date") or {}
            items.append({
                "id": page["id"].replace("-", ""),
                "task": prop(pr, "Task", "title") or "Untitled",
                "type": prop(pr, "Type", "select"),
                "week": prop(pr, "Week", "number"),
                "status": prop(pr, "Status", "select") or "Not started",
                "start": dates.get("start"),
                "end": dates.get("end"),
                "est": prop(pr, "Est. Hours", "number"),
                "actual": prop(pr, "Actual Hours", "number"),
                "confidence": prop(pr, "Confidence", "select"),
                "skills": prop(pr, "Skills", "multi_select") or [],
                "notes": prop(pr, "Notes", "rich_text"),
            })
        if not res.get("has_more"):
            break
        cursor = res["next_cursor"]
    items.sort(key=lambda i: (i["start"] or "9999", i["week"] or 0, i["task"]))
    return items


def children(block_id, token):
    out, cursor = [], None
    while True:
        q = "?page_size=100" + (f"&start_cursor={cursor}" if cursor else "")
        res = call("GET", f"/blocks/{block_id}/children{q}", token)
        out += res["results"]
        if not res.get("has_more"):
            return out
        cursor = res["next_cursor"]


def fetch_skills(token):
    """Read the 'Skill area | Now | Target | Covered in' table, if present."""
    for block in children(PAGE_ID, token):
        if block["type"] != "table":
            continue
        rows = [
            [plain(cell) for cell in r["table_row"]["cells"]]
            for r in children(block["id"], token)
            if r["type"] == "table_row"
        ]
        if rows and rows[0] and rows[0][0].lower().startswith("skill"):
            return [
                {"area": r[0], "now": r[1], "target": r[2], "covered": r[3] if len(r) > 3 else ""}
                for r in rows[1:] if r and r[0]
            ]
    return []


def main():
    token = os.environ.get("NOTION_TOKEN", "").strip()
    if not token:
        raise SystemExit(
            "NOTION_TOKEN is not set. Add it as a repository secret "
            "(Settings > Secrets and variables > Actions)."
        )
    content = {
        "source": f"https://app.notion.com/p/{PAGE_ID}",
        "items": fetch_items(token),
        "skills": fetch_skills(token),
    }
    old = {}
    if OUT.exists():
        try:
            old = json.loads(OUT.read_text())
        except ValueError:
            pass
    if {k: v for k, v in old.items() if k != "synced_at"} == content:
        print(f"No changes in Notion ({len(content['items'])} rows).")
        return
    content["synced_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    OUT.write_text(json.dumps(content, indent=1, ensure_ascii=False) + "\n")
    print(f"Wrote {OUT} with {len(content['items'])} rows and {len(content['skills'])} skill areas.")


if __name__ == "__main__":
    sys.exit(main())
