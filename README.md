# Ai Source

Live AI news briefing from:

- [TechCrunch AI](https://techcrunch.com/category/artificial-intelligence/)
- [VentureBeat AI](https://venturebeat.com/category/ai/)
- [The Verge AI](https://www.theverge.com/ai-artificial-intelligence/)
- [AI/TLDR](https://ai-tldr.dev/)
- [The Signal](https://infinitytechstack.uk/ai-signal) (Prismix backup if Signal is blocked)
- [X](https://x.com) (AI search + account timelines via api.fxtwitter.com; no API key)

## Live site

https://dspatts.github.io/Spatts-AI-blog/

Refreshed about **every 3 hours** by GitHub Actions.

## Manual refresh

In the repo: **Actions → Refresh + Pages → Run workflow**.

Or locally:

```bash
node scripts/refresh.mjs
```

## Curated harvests

Evan The Grunt can drop a harvest at `harvests/latest.json`. Each Actions run (push to `main`, the 3-hour cron, or **Run workflow**) rebuilds `public/index.html` and `public/data/news.json` from that file plus live RSS/X — it does not reuse the previous cluster snapshot.

A harvest newer than **2 hours** can win cluster leads and same-URL titles/summaries. The Top 10 still reserves slots for live publisher clusters and up to three X-only clusters, so a 20-post harvest cannot freeze the grid. After 2 hours the harvest stays in the pool but loses lead preference and ranks with the feeds.

Existing post fields keep working. Optional extras Evan can send:

```json
{
  "title": "OpenAI launches GPT-6 Astra — AGI era",
  "summary": "GPT-6 Astra frontier computer-use model; Brockman framed AGI era.",
  "url": "https://venturebeat.com/technology/welcome-to-the-agi-era-openai-launches-gpt-6-astra",
  "sourceName": "VentureBeat",
  "sourceId": "venturebeat",
  "sourceHome": "https://venturebeat.com/category/ai/",
  "tags": ["agents", "model-releases"],
  "clusterId": "openai-astra"
}
```

- `tags` — string array. Topic ids: `model-releases`, `agents`, `funding`, `research`, `policy`. Aliases like `model-release` or `agent` are normalized. Refresh also derives tags from title/summary/source when omitted. `x` is a source filter, not a topic tag. `rumor` marks an X item for the Rumor mill (not Top 10).
- `clusterId` — stable id so Evan can pre-group outlets covering one event. Without it, refresh uses title/URL/keyword heuristics (Astra, German wiki/collusion, Gemini Photos, and similar).

### Rumor mill (X only)

Optional top-level `rumors: []`, and/or `posts` items with `"tags": ["rumor"]`. X-shaped items only (`sourceKind: "x"` or an `x.com` URL). Blog/forum rumors are ignored for now.

```json
{
  "title": "xAI said to ship a Grok video model as soon as next week",
  "summary": "Single X thread, no lab post or second outlet. Unconfirmed until it clusters.",
  "url": "https://x.com/frontierwatch/status/2095801100000000001",
  "via": "@frontierwatch",
  "sourceKind": "x",
  "harvestedAt": "2026-09-04T20:15:00.000Z",
  "tags": ["rumor"]
}
```

When the same story is confirmed across outlets (shared URL or a multi-source cluster), it leaves the mill and is not double-counted in Top 10. **Rumors** chip shows mill cards only. **All** shows mill + confirmed clusters. Topic chips hide the mill and filter confirmed cards. **X** still means confirmed X-led Top cards, not the mill.
