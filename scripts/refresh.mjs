#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = join(ROOT, "public", "data", "news.json");
const INDEX_PATH = join(ROOT, "public", "index.html");
const API = "https://api.fxtwitter.com";
const UA = "SpattsAiBlog/1.0 (+local daily briefing)";

const SEARCH_QUERY =
  'lang:en (OpenAI OR Anthropic OR DeepMind OR xAI OR "artificial intelligence" OR LLM OR Claude OR Gemini OR Grok)';

const ACCOUNTS = [
  "OpenAI",
  "AnthropicAI",
  "GoogleDeepMind",
  "AIatMeta",
  "claudeai",
  "NVIDIA",
  "HuggingFace",
  "MistralAI",
  "sama",
  "karpathy",
  "techcrunch",
  "TheInformation",
];

const SPAM =
  /\b(giveaway|airdrop|promo code|follow me|subscribe to my|crypto pump|nudes)\b/i;
const MAX_AGE_HOURS = 72;

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function searchFeed(feed) {
  const url = `${API}/2/search?q=${encodeURIComponent(SEARCH_QUERY)}&feed=${feed}&count=30`;
  const data = await fetchJson(url);
  return Array.isArray(data.results) ? data.results : [];
}

async function accountStatuses(handle) {
  const url = `${API}/2/profile/${encodeURIComponent(handle)}/statuses?count=12`;
  const data = await fetchJson(url);
  return Array.isArray(data.results) ? data.results : [];
}

function isStatus(item) {
  return item && item.type === "status" && item.id && item.text;
}

function score(item) {
  const likes = item.likes || 0;
  const reposts = item.reposts || 0;
  const quotes = item.quotes || 0;
  const views = item.views || 0;
  const followers = item.author?.followers || 0;
  const verified = item.author?.verification?.verified ? 1.15 : 1;
  const replyPenalty = item.replying_to ? 0.55 : 1;
  const ageHours = Math.max(
    0,
    (Date.now() / 1000 - (item.created_timestamp || 0)) / 3600,
  );
  const recency = ageHours < 36 ? 1.2 : ageHours < 72 ? 1 : 0.7;
  const social = likes + reposts * 3 + quotes * 4 + views / 400;
  const reach = Math.log10(followers + 10);
  return social * verified * replyPenalty * recency * (1 + reach / 8);
}

function titleFrom(text) {
  const cleaned = text.replace(/\s+/g, " ").replace(/https?:\/\/\S+/g, "").trim();
  const first = cleaned.split(/(?<=[.!?])\s+/)[0] || cleaned;
  return first.length > 110 ? `${first.slice(0, 107).trim()}…` : first;
}

/** One short blurb for the card — first sentence-ish, capped tightly. */
function summaryFrom(text) {
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/@\w+/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
  if (!cleaned) return "";
  let sentence = (cleaned.split(/(?<=[.!?])\s+/)[0] || cleaned).trim();
  sentence = sentence
    .replace(/\b(and|or|with|for|to|of|,)\s*[.!?]?$/i, "")
    .replace(/[,:;\-–—]+$/g, "")
    .trim();
  const max = 140;
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max - 1);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > 80 ? cut.slice(0, atWord) : cut).trim()}…`;
}

function normalize(item) {
  return {
    id: item.id,
    url: item.url,
    title: titleFrom(item.text),
    text: item.text.trim(),
    summary: summaryFrom(item.text),
    createdAt: item.created_at,
    createdTimestamp: item.created_timestamp,
    likes: item.likes || 0,
    reposts: item.reposts || 0,
    quotes: item.quotes || 0,
    views: item.views || 0,
    lang: item.lang || "",
    author: {
      name: item.author?.name || item.author?.screen_name || "Unknown",
      handle: item.author?.screen_name || "",
      url: item.author?.url || "",
      avatar: item.author?.avatar_url || "",
      followers: item.author?.followers || 0,
      verified: Boolean(item.author?.verification?.verified),
    },
    score: Math.round(score(item)),
  };
}

function ageHours(item) {
  return Math.max(0, (Date.now() / 1000 - (item.created_timestamp || 0)) / 3600);
}

function keep(item) {
  if (!isStatus(item)) return false;
  if (item.lang && item.lang !== "en") return false;
  if (SPAM.test(item.text)) return false;
  if (ageHours(item) > MAX_AGE_HOURS) return false;
  const likes = item.likes || 0;
  const views = item.views || 0;
  const followers = item.author?.followers || 0;
  const verified = Boolean(item.author?.verification?.verified);
  const official = ACCOUNTS.map((a) => a.toLowerCase()).includes(
    (item.author?.screen_name || "").toLowerCase(),
  );
  if (official) return item.text.trim().length > 40;
  if (verified && followers >= 20_000 && item.text.trim().length > 50) return true;
  return (likes >= 80 || views >= 15_000) && followers >= 1500;
}

const TOP_N = 10;

function pickTop(items) {
  const byId = new Map();
  for (const item of items.filter(keep)) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  const ranked = [...byId.values()].sort((a, b) => score(b) - score(a));
  const chosen = [];
  const authors = new Set();
  const titles = [];
  for (const item of ranked) {
    const handle = (item.author?.screen_name || "").toLowerCase();
    const title = titleFrom(item.text).slice(0, 48).toLowerCase();
    if (authors.has(handle)) continue;
    if (titles.some((t) => title.startsWith(t) || t.startsWith(title))) continue;
    chosen.push(normalize(item));
    authors.add(handle);
    titles.push(title);
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

function formatNumber(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatWhen(isoLike, timestamp) {
  const date = timestamp ? new Date(timestamp * 1000) : new Date(isoLike);
  if (Number.isNaN(date.getTime())) return isoLike || "";
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
      const avatar = post.author.avatar
        ? `<img src="${escapeHtml(post.author.avatar)}" alt="" width="28" height="28">`
        : "";
      return `<article class="story">
  <div class="rank">${rank}</div>
  <div>
    <h2><a href="${escapeHtml(post.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(post.title)}</a></h2>
    <div class="meta">
      <span class="author">${avatar}<span>${escapeHtml(post.author.name)} · @${escapeHtml(post.author.handle)}</span></span>
      <span>${escapeHtml(formatWhen(post.createdAt, post.createdTimestamp))}</span>
    </div>
  </div>
  <p class="body">${escapeHtml(post.summary || summaryFrom(post.text))}</p>
  <div class="stats">
    <span>${formatNumber(post.likes)} likes</span>
    <span>${formatNumber(post.reposts)} reposts</span>
    <span>${formatNumber(post.views)} views</span>
    <a class="x-link" href="${escapeHtml(post.url)}" target="_blank" rel="noopener noreferrer">Read on X →</a>
  </div>
</article>`;
    })
    .join("\n");

  const empty = `<div class="empty">No posts made it through today’s filter. The next refresh will try again.</div>`;
  const refreshed = formatWhen(payload.refreshedAt);
  const briefing = formatWhen(payload.briefingDate);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Spatts Ai Blog — Top 10 from X</title>
  <meta name="description" content="Daily top 10 AI posts from X.com, curated for Spatts Ai Blog.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500;600;700&family=Outfit:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="./styles.css">
</head>
<body>
  <div class="wrap">
    <header class="masthead">
      <p class="kicker"><span>Sourced from X.com</span><span>Refreshed daily</span></p>
      <h1>Spatts Ai Blog</h1>
      <p class="dateline">
        <strong>${escapeHtml(briefing)}</strong>
        <span>Top 10 latest AI posts</span>
      </p>
    </header>
    <main class="grid">
      ${stories || empty}
    </main>
    <p class="status">Last refresh: ${escapeHtml(refreshed)} · Ranked by recency, reach, and engagement.</p>
    <footer>Spatts Ai Blog is a local daily briefing. Original posts stay on X; this page only lists the day’s top ten.</footer>
  </div>
</body>
</html>
`;
}

async function gather() {
  const batches = await Promise.allSettled([
    searchFeed("top"),
    searchFeed("latest"),
    ...ACCOUNTS.map((handle) => accountStatuses(handle)),
  ]);
  const items = [];
  for (const result of batches) {
    if (result.status === "fulfilled") items.push(...result.value);
    else console.error(String(result.reason?.message || result.reason));
  }
  return items;
}

export async function refreshNews() {
  const items = await gather();
  const posts = pickTop(items);
  const payload = {
    source: "x.com",
    briefingDate: new Date().toISOString(),
    refreshedAt: new Date().toISOString(),
    posts,
  };
  await mkdir(dirname(DATA_PATH), { recursive: true });
  await writeFile(DATA_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(INDEX_PATH, renderHtml(payload));
  return payload;
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) {
  const payload = await refreshNews();
  console.log(`Wrote ${payload.posts.length} posts to public/index.html`);
}
