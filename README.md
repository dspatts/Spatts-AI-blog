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

Evan The Grunt can drop a harvest at `harvests/latest.json`. The refresh prefers those titles/summaries as cluster leads and fills from live publisher feeds and X as needed. Same-event coverage is grouped into one Top card (about 10 clusters, not 10 raw posts). Up to three X-only clusters can appear in the mix when they are not absorbed into a publisher story.

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

- `tags` — string array. Known ids: `model-releases`, `agents`, `funding`, `research`, `policy`, `x`. Aliases like `model-release` or `agent` are normalized. Refresh also derives tags from title/summary/source when omitted.
- `clusterId` — stable id so Evan can pre-group outlets covering one event. Without it, refresh uses title/URL/keyword heuristics (Astra, German wiki/collusion, Gemini Photos, and similar).

Masthead chips (All | Model releases | Agents | Funding | Research | Policy | X) filter the grid in the browser.
