# Spatts Ai Blog

Daily briefing of the **top 10 latest AI posts from X.com**.

## Live site (free)

Hosted on **GitHub Pages**. Refreshed every morning at **7:00 Australia/Sydney** by GitHub Actions — your PC does not need to be on.

After the first deploy, the site is at:

`https://<your-github-username>.github.io/spatts-ai-blog/`

## Manual refresh

In the GitHub repo: **Actions → Daily refresh + Pages → Run workflow**.

## Local optional

```bash
node scripts/refresh.mjs
node scripts/server.mjs
```

Then open http://127.0.0.1:4173

Local systemd units under `systemd/` are optional if you still want a LAN copy.
