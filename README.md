# Spatts Ai Blog

Live AI news briefing from:

- [TechCrunch AI](https://techcrunch.com/category/artificial-intelligence/)
- [VentureBeat AI](https://venturebeat.com/category/ai/)
- [The Verge AI](https://www.theverge.com/ai-artificial-intelligence/)
- [AI/TLDR](https://ai-tldr.dev/)
- [The Signal](https://infinitytechstack.uk/ai-signal) (Prismix backup if Signal is blocked)

## Live site

https://dspatts.github.io/Spatts-AI-blog/

Refreshed about **every 30 minutes** by GitHub Actions.

## Manual refresh

In the repo: **Actions → Refresh + Pages → Run workflow**.

Or locally:

```bash
node scripts/refresh.mjs
```

## Curated harvests

Evan The Grunt can drop a harvest at `harvests/latest.json`. The refresh prefers those titles/summaries (Top 10) and fills from live feeds as needed.
