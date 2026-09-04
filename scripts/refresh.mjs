#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = join(ROOT, "public", "data", "news.json");
const INDEX_PATH = join(ROOT, "public", "index.html");
const CURATED_PATH = join(ROOT, "harvests", "latest.json");
const UA =
  "SpattsAiBlog/1.2 (+https://dspatts.github.io/Spatts-AI-blog/; news aggregator)";
const TOP_N = 10;
const CURATED_MAX_AGE_MS = 2 * 60 * 60 * 1000;

const SOURCES = [
  {
    id: "techcrunch",
    name: "TechCrunch",
    home: "https://techcrunch.com/category/artificial-intelligence/",
    feeds: ["https://techcrunch.com/category/artificial-intelligence/feed/"],
  },
  {
    id: "venturebeat",
    name: "VentureBeat",
    home: "https://venturebeat.com/category/ai/",
    feeds: [
      "https://venturebeat.com/category/ai/feed/",
      "https://news.google.com/rss/search?q=site:venturebeat.com+(AI+OR+OpenAI+OR+Anthropic+OR+GPT+OR+Claude)+when:3d&hl=en-US&gl=US&ceid=US:en",
    ],
  },
  {
    id: "verge",
    name: "The Verge",
    home: "https://www.theverge.com/ai-artificial-intelligence/",
    feeds: ["https://www.theverge.com/rss/ai-artificial-intelligence/index.xml"],
  },
  {
    id: "aitldr",
    name: "AI/TLDR",
    home: "https://ai-tldr.dev/",
    feeds: ["https://ai-tldr.dev/feed.xml"],
  },
  {
    id: "signal",
    name: "The Signal",
    home: "https://infinitytechstack.uk/ai-signal",
    feeds: [
      "https://infinitytechstack.uk/ai-signal",
      "https://prismix.dev/news",
    ],
  },
];

const AI_HINT =
  /\b(ai|agi|llm|gpt|claude|gemini|openai|anthropic|nvidia|model|agent|ml|machine learning|deep learning|genai|chatbot|copilot)\b/i;

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept:
        "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5",
    },
    signal: AbortSignal.timeout(20_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return {
    text: await res.text(),
    type: res.headers.get("content-type") || "",
  };
}

function decodeEntities(value) {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCharCode(parseInt(n, 16)),
    );
}

function stripTags(html) {
  return decodeEntities(
    html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  );
}

function summaryFrom(text, max = 140) {
  const cleaned = stripTags(text || "");
  if (!cleaned) return "";
  const sentence = cleaned.split(/(?<=[.!?])\s+/)[0] || cleaned;
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max - 1);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > 80 ? cut.slice(0, atWord) : cut).trim()}…`;
}

function looksLikeAiStory(item) {
  const hay = `${item.title} ${item.summary} ${item.url}`;
  if (
    /inducement grants|managing director|advertising:|corrects foothill|nasdaq listing/i.test(
      hay,
    )
  ) {
    return false;
  }
  if (item.sourceId === "venturebeat") {
    if (/venturebeat\.com\/(technology|ai|games)\//i.test(item.url)) return true;
    return AI_HINT.test(hay);
  }
  return true;
}

function normalizeUrl(url) {
  return String(url || "")
    .replace(/[?#].*$/, "")
    .replace(/\/$/, "");
}

async function loadCurated() {
  try {
    const raw = await readFile(CURATED_PATH, "utf8");
    const data = JSON.parse(raw);
    const harvestedAt = data.harvestedAt ? Date.parse(data.harvestedAt) : 0;
    if (harvestedAt && Date.now() - harvestedAt > CURATED_MAX_AGE_MS) {
      console.error("Curated harvest is older than 2h; still preferring it when present");
    }
    const posts = Array.isArray(data.posts) ? data.posts : [];
    return posts
      .filter((p) => p && p.title && p.url)
      .map((p, i) => ({
        id: `curated:${p.url}`,
        url: p.url,
        title: p.title,
        summary: p.summary || summaryFrom(p.title),
        sourceId: p.sourceId || "curated",
        sourceName: p.sourceName || "Curated",
        sourceHome: p.sourceHome || p.url,
        publishedAt: data.harvestedAt || null,
        publishedTs: (harvestedAt || Date.now()) - i,
        curated: true,
      }));
  } catch {
    return [];
  }
}

function parseRssOrAtom(xml, source) {
  const items = [];
  const blocks = [
    ...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi),
    ...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi),
  ];
  for (const match of blocks) {
    const block = match[0];
    const title = decodeEntities(
      (block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim(),
    );
    let link =
      block.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] ||
      block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ||
      "";
    link = decodeEntities(stripTags(link));
    const googleReal = link.match(/url=([^&]+)/);
    if (googleReal) {
      try {
        link = decodeURIComponent(googleReal[1]);
      } catch {
        /* keep */
      }
    }
    const rawDate =
      block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] ||
      block.match(/<published[^>]*>([\s\S]*?)<\/published>/i)?.[1] ||
      block.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1] ||
      "";
    const description =
      block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] ||
      block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1] ||
      block.match(/<content[^>]*>([\s\S]*?)<\/content>/i)?.[1] ||
      "";
    if (!title || !link) continue;
    const date = new Date(decodeEntities(stripTags(rawDate)));
    items.push({
      id: `${source.id}:${link}`,
      url: link,
      title: stripTags(title),
      summary: summaryFrom(description || title),
      sourceId: source.id,
      sourceName: source.name,
      sourceHome: source.home,
      publishedAt: Number.isNaN(date.getTime()) ? null : date.toISOString(),
      publishedTs: Number.isNaN(date.getTime()) ? 0 : date.getTime(),
    });
  }
  return items;
}

function parsePrismixOrHtml(html, source) {
  const items = [];
  const re =
    /<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set();
  for (const match of html.matchAll(re)) {
    const url = match[1];
    const title = stripTags(match[2]);
    if (!title || title.length < 20 || title.length > 180) continue;
    if (seen.has(url)) continue;
    if (/privacy|terms|login|signup|twitter|x\.com|facebook|linkedin/i.test(url))
      continue;
    seen.add(url);
    items.push({
      id: `${source.id}:${url}`,
      url,
      title,
      summary: summaryFrom(title),
      sourceId: source.id,
      sourceName: source.name,
      sourceHome: source.home,
      publishedAt: null,
      publishedTs: Date.now(),
    });
    if (items.length >= 8) break;
  }
  return items;
}

async function harvestSource(source) {
  const errors = [];
  for (const feed of source.feeds) {
    try {
      const { text, type } = await fetchText(feed);
      if (/429|security checkpoint|just a moment/i.test(text.slice(0, 500))) {
        errors.push(`blocked ${feed}`);
        continue;
      }
      let items = [];
      if (/<rss\b|<feed\b|<item\b|<entry\b/i.test(text) || /xml/i.test(type)) {
        items = parseRssOrAtom(text, source);
      } else {
        items = parsePrismixOrHtml(text, source);
      }
      if (items.length) return { items, errors };
      errors.push(`empty ${feed}`);
    } catch (err) {
      errors.push(String(err.message || err));
    }
  }
  return { items: [], errors };
}

function pickTop(items) {
  const byUrl = new Map();
  for (const item of items.filter(looksLikeAiStory)) {
    const key = normalizeUrl(item.url);
    const prev = byUrl.get(key);
    if (!prev || (item.curated && !prev.curated)) byUrl.set(key, item);
  }
  const ranked = [...byUrl.values()].sort((a, b) => {
    if (Boolean(b.curated) !== Boolean(a.curated)) return a.curated ? -1 : 1;
    if (b.publishedTs !== a.publishedTs) return b.publishedTs - a.publishedTs;
    return a.title.localeCompare(b.title);
  });

  const chosen = [];
  const perSource = new Map();
  for (const item of ranked) {
    const count = perSource.get(item.sourceId) || 0;
    if (count >= 3) continue;
    chosen.push(item);
    perSource.set(item.sourceId, count + 1);
    if (chosen.length === TOP_N) return chosen;
  }
  for (const item of ranked) {
    if (chosen.includes(item)) continue;
    chosen.push(item);
    if (chosen.length === TOP_N) break;
  }
  return chosen;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatWhen(iso) {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Sydney",
  }).format(date);
}

function renderHtml(payload) {
  const stories = payload.posts
    .map((post, index) => {
      const rank = String(index + 1).padStart(2, "0");
      const when = post.publishedAt ? formatWhen(post.publishedAt) : "";
      return `<article class="story">
  <div class="rank">${rank}</div>
  <div>
    <p class="source"><a href="${escapeHtml(post.sourceHome)}" target="_blank" rel="noopener noreferrer">${escapeHtml(post.sourceName)}</a></p>
    <h2><a href="${escapeHtml(post.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(post.title)}</a></h2>
    <div class="meta">
      ${when ? `<span>${escapeHtml(when)}</span>` : ""}
    </div>
  </div>
  <p class="body">${escapeHtml(post.summary)}</p>
  <div class="stats">
    <a class="x-link" href="${escapeHtml(post.url)}" target="_blank" rel="noopener noreferrer">Read story →</a>
  </div>
</article>`;
    })
    .join("\n");

  const empty =
    `<div class="empty">No stories made it through this harvest. The next refresh will try again.</div>`;
  const refreshed = formatWhen(payload.refreshedAt);
  const sourcesLine = (payload.sources || [])
    .map(
      (s) =>
        `${s.name}${s.count ? ` (${s.count})` : s.ok ? "" : " (skipped)"}`,
    )
    .join(" · ");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Spatts Ai Blog — AI news</title>
  <meta name="description" content="Top AI news from TechCrunch, VentureBeat, The Verge, AI/TLDR, and The Signal. Refreshed every 30 minutes.">
  <meta http-equiv="refresh" content="1800">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500;600;700&family=Outfit:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="./styles.css">
</head>
<body>
  <div class="wrap">
    <header class="masthead">
      <p class="kicker"><span>Multi-source AI news</span><span>Every 30 minutes</span></p>
      <h1>Spatts Ai Blog</h1>
      <p class="dateline">
        <strong>${escapeHtml(refreshed)}</strong>
        <span>Top 10 stories right now</span>
      </p>
    </header>
    <main class="grid">
      ${stories || empty}
    </main>
    <p class="status">Last refresh: ${escapeHtml(refreshed)} · ${escapeHtml(sourcesLine)}</p>
    <footer>Spatts Ai Blog aggregates headlines from TechCrunch, VentureBeat, The Verge, AI/TLDR, and The Signal. Original articles stay on their publishers’ sites.</footer>
  </div>
</body>
</html>
`;
}

export async function refreshNews() {
  const curated = await loadCurated();
  const all = [...curated];
  const sourceStats = [];
  if (curated.length) {
    sourceStats.push({
      id: "curated",
      name: "Evan harvest",
      ok: true,
      count: curated.length,
      errors: [],
    });
  }
  for (const source of SOURCES) {
    const { items, errors } = await harvestSource(source);
    sourceStats.push({
      id: source.id,
      name: source.name,
      ok: items.length > 0,
      count: items.length,
      errors,
    });
    if (errors.length) console.error(source.id, errors.join("; "));
    all.push(...items);
  }

  const posts = pickTop(all);
  const payload = {
    source: "multi",
    sources: sourceStats,
    briefingDate: new Date().toISOString(),
    refreshedAt: new Date().toISOString(),
    posts,
  };
  await mkdir(dirname(DATA_PATH), { recursive: true });
  await writeFile(DATA_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(INDEX_PATH, renderHtml(payload));
  return payload;
}

const isDirect =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) {
  const payload = await refreshNews();
  console.log(
    `Wrote ${payload.posts.length} posts (${payload.posts.filter((p) => p.curated).length} curated)`,
  );
}
