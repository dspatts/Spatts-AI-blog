#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = join(ROOT, "public", "data", "news.json");
const INDEX_PATH = join(ROOT, "public", "index.html");
const CURATED_PATH = join(ROOT, "harvests", "latest.json");
const UA =
  "AiSource/1.4 (+https://dspatts.github.io/Spatts-AI-blog/; news aggregator)";
const TOP_N = 10;
const SOURCE_CAP = 3;
const X_TOP_CAP = 3;
const CURATED_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const FX_API = "https://api.fxtwitter.com";
const X_SEARCH_QUERY =
  'lang:en (OpenAI OR Anthropic OR DeepMind OR xAI OR "artificial intelligence" OR LLM OR Claude OR Gemini OR Grok)';
const X_ACCOUNTS = [
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
const X_SPAM =
  /\b(giveaway|airdrop|promo code|follow me|subscribe to my|crypto pump|nudes)\b/i;
const X_MAX_AGE_HOURS = 72;
const X_SOURCE = {
  id: "x",
  name: "X",
  home: "https://x.com",
};

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

const TAG_IDS = [
  "model-releases",
  "agents",
  "funding",
  "research",
  "policy",
  "x",
];
const TAG_LABELS = {
  "model-releases": "Model releases",
  agents: "Agents",
  funding: "Funding",
  research: "Research",
  policy: "Policy",
  x: "X",
};
const TAG_ALIASES = {
  "model-release": "model-releases",
  "model-releases": "model-releases",
  models: "model-releases",
  agent: "agents",
  agents: "agents",
  funding: "funding",
  research: "research",
  policy: "policy",
  x: "x",
  twitter: "x",
};
const STOP = new Set([
  "the",
  "and",
  "for",
  "that",
  "with",
  "from",
  "this",
  "have",
  "will",
  "are",
  "was",
  "were",
  "been",
  "into",
  "about",
  "after",
  "before",
  "your",
  "their",
  "what",
  "when",
  "which",
  "while",
  "than",
  "then",
  "them",
  "they",
  "its",
  "but",
  "not",
  "you",
  "our",
  "out",
  "how",
  "why",
  "can",
  "has",
  "had",
  "all",
  "any",
  "more",
  "new",
  "now",
  "via",
  "over",
]);

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

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
    redirect: "follow",
  });
  const data = await res.json().catch(() => null);
  // fxtwitter search is intermittently 404 with an empty results payload
  if (!res.ok) {
    if (res.status === 404 && data && Array.isArray(data.results)) return data;
    throw new Error(`${res.status} ${url}`);
  }
  return data;
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
        tags: Array.isArray(p.tags) ? p.tags : undefined,
        clusterId:
          typeof p.clusterId === "string" && p.clusterId.trim()
            ? p.clusterId.trim()
            : undefined,
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

async function searchXFeed(feed) {
  const url = `${FX_API}/2/search?q=${encodeURIComponent(X_SEARCH_QUERY)}&feed=${feed}&count=30`;
  const data = await fetchJson(url);
  return Array.isArray(data.results) ? data.results : [];
}

async function accountStatuses(handle) {
  const url = `${FX_API}/2/profile/${encodeURIComponent(handle)}/statuses?count=12`;
  const data = await fetchJson(url);
  return Array.isArray(data.results) ? data.results : [];
}

function isXStatus(item) {
  return Boolean(item && item.type === "status" && item.id && item.text);
}

function xAgeHours(item) {
  return Math.max(0, (Date.now() / 1000 - (item.created_timestamp || 0)) / 3600);
}

function scoreX(item) {
  const likes = item.likes || 0;
  const reposts = item.reposts || 0;
  const quotes = item.quotes || 0;
  const views = item.views || 0;
  const followers = item.author?.followers || 0;
  const verified = item.author?.verification?.verified ? 1.15 : 1;
  const replyPenalty = item.replying_to ? 0.55 : 1;
  const ageHours = xAgeHours(item);
  const recency = ageHours < 36 ? 1.2 : ageHours < 72 ? 1 : 0.7;
  const social = likes + reposts * 3 + quotes * 4 + views / 400;
  const reach = Math.log10(followers + 10);
  return social * verified * replyPenalty * recency * (1 + reach / 8);
}

function titleFromTweet(text) {
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/https?:\/\/\S+/g, "")
    .trim();
  const first = cleaned.split(/(?<=[.!?])\s+/)[0] || cleaned;
  return first.length > 110 ? `${first.slice(0, 107).trim()}…` : first;
}

function summaryFromTweet(text) {
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/@\w+/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
  if (!cleaned) return "";
  if (cleaned.length <= 140) return cleaned;
  const cut = cleaned.slice(0, 139);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > 80 ? cut.slice(0, atWord) : cut).trim()}…`;
}

function keepX(item) {
  if (!isXStatus(item)) return false;
  if (item.lang && item.lang !== "en") return false;
  if (X_SPAM.test(item.text)) return false;
  if (xAgeHours(item) > X_MAX_AGE_HOURS) return false;
  const likes = item.likes || 0;
  const views = item.views || 0;
  const followers = item.author?.followers || 0;
  const verified = Boolean(item.author?.verification?.verified);
  const official = X_ACCOUNTS.map((a) => a.toLowerCase()).includes(
    (item.author?.screen_name || "").toLowerCase(),
  );
  if (official) return item.text.trim().length > 40;
  if (verified && followers >= 20_000 && item.text.trim().length > 50) return true;
  return (likes >= 80 || views >= 15_000) && followers >= 1500;
}

function tweetUrl(item) {
  const handle = item.author?.screen_name || "i";
  const id = item.id;
  const raw = String(item.url || `https://x.com/${handle}/status/${id}`);
  return raw.replace(/^https?:\/\/(www\.)?twitter\.com\//i, "https://x.com/");
}

function toXItem(item) {
  const ts = item.created_timestamp
    ? item.created_timestamp * 1000
    : Date.parse(item.created_at) || 0;
  return {
    id: `x:${item.id}`,
    url: tweetUrl(item),
    title: titleFromTweet(item.text),
    summary: summaryFromTweet(item.text) || summaryFrom(item.text),
    sourceId: X_SOURCE.id,
    sourceName: X_SOURCE.name,
    sourceHome: X_SOURCE.home,
    publishedAt: ts ? new Date(ts).toISOString() : item.created_at || null,
    publishedTs: ts || 0,
    score: Math.round(scoreX(item)),
    authorHandle: (item.author?.screen_name || "").toLowerCase(),
  };
}

function pickXCandidates(rawItems) {
  const byId = new Map();
  for (const item of rawItems.filter(keepX)) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  const ranked = [...byId.values()].sort((a, b) => scoreX(b) - scoreX(a));
  const chosen = [];
  const authors = new Set();
  const titles = [];
  for (const item of ranked) {
    const handle = (item.author?.screen_name || "").toLowerCase();
    const title = titleFromTweet(item.text).slice(0, 48).toLowerCase();
    if (!title) continue;
    if (handle && authors.has(handle)) continue;
    if (titles.some((t) => title.startsWith(t) || t.startsWith(title))) continue;
    chosen.push(toXItem(item));
    if (handle) authors.add(handle);
    titles.push(title);
    if (chosen.length >= 12) break;
  }
  return chosen;
}

async function harvestX() {
  const errors = [];
  const batches = await Promise.allSettled([
    searchXFeed("top"),
    searchXFeed("latest"),
    ...X_ACCOUNTS.map((handle) => accountStatuses(handle)),
  ]);
  const raw = [];
  for (const result of batches) {
    if (result.status === "fulfilled") raw.push(...result.value);
    else errors.push(String(result.reason?.message || result.reason));
  }
  return { items: pickXCandidates(raw), errors };
}

function compareStories(a, b) {
  if (Boolean(b.curated) !== Boolean(a.curated)) return a.curated ? -1 : 1;
  if (b.publishedTs !== a.publishedTs) return b.publishedTs - a.publishedTs;
  return a.title.localeCompare(b.title);
}

function hay(post) {
  return `${post.title || ""} ${post.summary || ""} ${post.sourceName || ""} ${post.sourceId || ""} ${post.url || ""}`.toLowerCase();
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function tokenize(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP.has(t)),
  );
}

function titleTokens(post) {
  return tokenize(String(post.title || "").replace(/^x\s*[·•]\s*/i, ""));
}

function jaccard(a, b) {
  const inter = [...a].filter((t) => b.has(t)).length;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
}

function canonicalTag(value) {
  const id = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-");
  return TAG_ALIASES[id] || (TAG_IDS.includes(id) ? id : null);
}

function deriveTags(post) {
  const out = new Set();
  if (Array.isArray(post.tags)) {
    for (const t of post.tags) {
      const id = canonicalTag(t);
      if (id) out.add(id);
    }
  }
  const h = hay(post);
  if (post.sourceId === X_SOURCE.id) out.add("x");
  if (
    /\b(agent|agents|astra|collusion|swarm|orchestrat|mcp|playwright|computer use|computer-use|nemo claw|nemoclaw|hydrafusion|armature)\b/.test(
      h,
    )
  ) {
    out.add("agents");
  }
  if (
    /\b(model|models|gemini|gpt-|claude|qwen|llada|llm|open.?weight|open.?source model|cerebras|tinker|muse spark|transcribe)\b/.test(
      h,
    )
  ) {
    out.add("model-releases");
  }
  if (
    /\b(fund|funding|raises|raised|series [a-z]|ipo|coatue|a16z|andreessen|accel|round|seed|valuation)\b/.test(
      h,
    )
  ) {
    out.add("funding");
  }
  if (
    /\b(research|paper|arxiv|benchmark|study|lean|fermat|abliteration|wiki|wikipedia|collusion)\b/.test(
      h,
    )
  ) {
    out.add("research");
  }
  if (
    /\b(ftc|sec|lawsuit|court|nyt|new york times|label|labels|disclos|regulat|copyright)\b/.test(
      h,
    ) ||
    (/\bpolicy\b/.test(h) && !/\bpolicy-gated\b/.test(h))
  ) {
    out.add("policy");
  }
  return TAG_IDS.filter((id) => out.has(id));
}

function clusterTags(items) {
  const out = new Set();
  for (const p of items) {
    for (const t of deriveTags(p)) out.add(t);
  }
  return TAG_IDS.filter((id) => out.has(id));
}

function topicKey(post) {
  if (post.clusterId) return `id:${post.clusterId}`;
  const titleHay = String(post.title || "").toLowerCase();
  const h = hay(post);
  const u = String(post.url || "").toLowerCase();
  // Wiki/collusion before Astra — summaries often mention Astra's launch.
  if (
    /\b(wikipedia|wiki)\b/.test(h) &&
    /\b(collusion|german|dse|hijack|rogue)\b/.test(h)
  ) {
    return "topic:wiki-collusion";
  }
  if (
    /\bcollusion\.wiki\b/.test(u) ||
    (/\bcollusion\b/.test(h) && /\b(wiki|agent)\b/.test(h))
  ) {
    return "topic:wiki-collusion";
  }
  if (/\bswarm\b/.test(h) && /\b(openai|agent)\b/.test(h)) {
    return "topic:wiki-collusion";
  }
  if (/\bgemini\b/.test(h) && /\bphotos?\b/.test(h)) return "topic:gemini-photos";
  if (/\bastra\b/.test(titleHay) || /\bopenai\.com\/index\/introducing-astra\b/.test(u)) {
    return "topic:astra";
  }
  if (/\bhugging ?face\b/.test(h) && /\b(nvidia|acquisition|acqui)\b/.test(h)) {
    return "topic:hf-nvidia";
  }
  if (/\bhugging ?face\b/.test(h) && /\b(open.?source|oss|models)\b/.test(h)) {
    return "topic:hf-oss";
  }
  if (/\bthinking machines\b/.test(h) || (/\btinker\b/.test(titleHay) && /\bthinking\b/.test(h))) {
    return "topic:tinker";
  }
  if (/\bcrusoe\b/.test(h)) return "topic:crusoe";
  if (/\bmuse spark\b/.test(h) || /\bmuseai\b/.test(h)) return "topic:muse-spark";
  if (
    /\btranscribe\b/.test(h) &&
    /\b(elevenlabs|speechmatics|assembly|deepgram|glad|rev|mai-transcribe)\b/.test(h)
  ) {
    return "topic:transcribe";
  }
  if (/\bhydrafusion\b/.test(h)) return "topic:hydrafusion";
  if (/\binstagram\b/.test(h) && /\blabel/.test(h)) return "topic:ig-labels";
  if (/\bfable\b/.test(h) && /\bcache\b/.test(h)) return "topic:fable-cache";
  if (/\bperplexity\b/.test(h) && /\b(computer|hybrid|agent|browser)\b/.test(h)) {
    return "topic:pplx-computer";
  }
  if (/\bcerebras\b/.test(h) && /\bqwen\b/.test(h)) return "topic:cerebras-qwen";
  if (/\barmature\b/.test(h)) return "topic:armature";
  if (/\bllada\b/.test(h)) return "topic:llada";
  if (/\banthropic\b/.test(h) && /\bipo\b/.test(h)) return "topic:anthropic-ipo";
  if (/\bcoatue\b/.test(h) || /\bmatx\b/.test(h)) return "topic:coatue-matx";
  if (/\bopenrouter\b/.test(h) && /\b(a16z|andreessen)\b/.test(h)) {
    return "topic:openrouter";
  }
  if (/\broland\b/.test(h) && /\b(ai|melody|musical)\b/.test(h)) return "topic:roland";
  if (/\bcopilot\b/.test(h) && /\b(nyt|new york times|times)\b/.test(h)) {
    return "topic:copilot-nyt";
  }
  if (/\bfermat\b/.test(h) || (/\blean\b/.test(h) && /\b(math|theorem|flt)\b/.test(h))) {
    return "topic:fermat-lean";
  }
  if (/\babliteration\b/.test(h)) return "topic:abliteration";
  if (/\bnemo.?claw\b/.test(h)) return "topic:nemoclaw";
  if (/\b(food|menus?|restaurant)\b/.test(h) && /\bai\b/.test(h)) return "topic:ai-food";
  return null;
}

function clusterBlurb(lead, related) {
  const base = String(lead.summary || "").trim();
  if (!base) {
    if (!related.length) return "";
    const names = [lead, ...related]
      .map((p) => p.sourceName)
      .filter((v, i, a) => v && a.indexOf(v) === i);
    return `${names.join(", ")} on the same story.`;
  }
  return base.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
}

function uniqueRelated(items, lead) {
  const seen = new Set([lead.sourceId]);
  const related = [];
  for (const p of items) {
    if (p === lead || seen.has(p.sourceId)) continue;
    seen.add(p.sourceId);
    related.push({
      title: p.title,
      url: p.url,
      sourceId: p.sourceId,
      sourceName: p.sourceName,
      sourceHome: p.sourceHome,
      publishedAt: p.publishedAt,
    });
  }
  return related;
}

function toCluster(items, clusterId) {
  const sorted = [...items].sort(compareStories);
  const lead = sorted[0];
  const related = uniqueRelated(sorted, lead);
  return {
    ...lead,
    tags: clusterTags(sorted),
    related,
    clusterId,
    clusterSize: related.length + 1,
    summary: clusterBlurb(lead, sorted.filter((p) => p !== lead)) || lead.summary,
  };
}

function clusterStories(posts) {
  const buckets = new Map();
  const leftovers = [];
  for (const p of posts) {
    const key = topicKey(p);
    if (key) {
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(p);
    } else {
      leftovers.push(p);
    }
  }

  const used = new Set();
  for (let i = 0; i < leftovers.length; i++) {
    if (used.has(i)) continue;
    const a = leftovers[i];
    const ta = titleTokens(a);
    const group = [a];
    used.add(i);
    for (let j = i + 1; j < leftovers.length; j++) {
      if (used.has(j)) continue;
      const b = leftovers[j];
      if (a.sourceId === b.sourceId) continue;
      const tb = titleTokens(b);
      const score = jaccard(ta, tb);
      const hostA = hostOf(a.url);
      const hostB = hostOf(b.url);
      const sameUrl = normalizeUrl(a.url) === normalizeUrl(b.url);
      if (score >= 0.45 || (sameUrl && hostA && hostA === hostB)) {
        group.push(b);
        used.add(j);
      }
    }
    const key = `auto:${slugify(a.title).slice(0, 48) || i}`;
    buckets.set(key, group);
  }

  return [...buckets.entries()].map(([id, items]) => toCluster(items, id));
}

function pickDiverse(pool, limit, perSource, xAuthors) {
  const chosen = [];
  if (limit <= 0) return chosen;
  const tryItem = (item, enforceCap) => {
    if (chosen.includes(item)) return;
    const count = perSource.get(item.sourceId) || 0;
    if (enforceCap && count >= SOURCE_CAP) return;
    if (item.sourceId === X_SOURCE.id) {
      const handle = (item.authorHandle || "").toLowerCase();
      if (handle && xAuthors.has(handle)) return;
    }
    chosen.push(item);
    perSource.set(item.sourceId, count + 1);
    if (item.sourceId === X_SOURCE.id) {
      const handle = (item.authorHandle || "").toLowerCase();
      if (handle) xAuthors.add(handle);
    }
  };
  for (const item of pool) {
    tryItem(item, true);
    if (chosen.length === limit) return chosen;
  }
  for (const item of pool) {
    tryItem(item, false);
    if (chosen.length === limit) break;
  }
  return chosen;
}

function pickTop(items) {
  const byUrl = new Map();
  for (const item of items.filter(looksLikeAiStory)) {
    const key = normalizeUrl(item.url);
    const prev = byUrl.get(key);
    if (!prev || (item.curated && !prev.curated)) byUrl.set(key, item);
  }
  const clusters = clusterStories([...byUrl.values()]);
  const xPool = clusters
    .filter((item) => item.sourceId === X_SOURCE.id)
    .sort(
      (a, b) =>
        (b.score || 0) - (a.score || 0) || b.publishedTs - a.publishedTs,
    );
  const otherPool = clusters
    .filter((item) => item.sourceId !== X_SOURCE.id)
    .sort(compareStories);

  const perSource = new Map();
  const xAuthors = new Set();
  // Hold up to 3 X-only clusters so a full curated harvest cannot crowd X out.
  const xPicked = pickDiverse(xPool, X_TOP_CAP, perSource, xAuthors);
  const others = pickDiverse(
    otherPool,
    TOP_N - xPicked.length,
    perSource,
    xAuthors,
  );
  return [...others, ...xPicked].sort(compareStories);
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

function alsoCovered(post) {
  const related = Array.isArray(post.related) ? post.related : [];
  if (!related.length) return "";
  const items = related
    .map((r) => {
      const label = r.sourceName || r.sourceId || "Source";
      return `<li><a href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a></li>`;
    })
    .join("");
  return `<details class="also"><summary>Also covered by</summary><ul>${items}</ul></details>`;
}

function tagPills(tags) {
  if (!tags?.length) return "";
  return `<ul class="tag-pills">${tags
    .map((t) => `<li>${escapeHtml(TAG_LABELS[t] || t)}</li>`)
    .join("")}</ul>`;
}

function filterBar() {
  const chips = [["all", "All"], ...TAG_IDS.map((id) => [id, TAG_LABELS[id]])]
    .map(
      ([id, label], i) =>
        `<button type="button" class="chip${i === 0 ? " is-on" : ""}" data-filter="${id}">${label}</button>`,
    )
    .join("");
  return `<nav class="filters" aria-label="Story filters">${chips}</nav>`;
}

function renderHtml(payload) {
  const stories = payload.posts
    .map((post, index) => {
      const rank = String(index + 1).padStart(2, "0");
      const when = post.publishedAt ? formatWhen(post.publishedAt) : "";
      const isX = post.sourceId === X_SOURCE.id;
      const handle = post.authorHandle ? `@${post.authorHandle}` : "";
      const cta = isX ? "Read on X →" : "Read story →";
      const meta = [handle, when]
        .filter(Boolean)
        .map((bit) => `<span>${escapeHtml(bit)}</span>`)
        .join("\n      ");
      const tags = (post.tags || []).join(" ");
      const size = post.clusterSize > 1 ? `<span>${post.clusterSize} sources</span>` : "";
      return `<article class="story" data-tags="${escapeHtml(tags)}">
  <div class="rank">${rank}</div>
  <div>
    <p class="source"><a href="${escapeHtml(post.sourceHome)}" target="_blank" rel="noopener noreferrer">${escapeHtml(post.sourceName)}</a></p>
    <h2><a href="${escapeHtml(post.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(post.title)}</a></h2>
    <div class="meta">
      ${[meta, size].filter(Boolean).join("\n      ")}
    </div>
  </div>
  <p class="body">${escapeHtml(post.summary)}</p>
  ${alsoCovered(post)}
  ${tagPills(post.tags)}
  <div class="stats">
    <a class="x-link" href="${escapeHtml(post.url)}" target="_blank" rel="noopener noreferrer">${cta}</a>
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
  const clusterCount = payload.posts.length;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ai Source — AI news</title>
  <meta name="description" content="Top AI news from TechCrunch, VentureBeat, The Verge, AI/TLDR, The Signal, and X. Refreshed every 3 hours.">
  <meta http-equiv="refresh" content="10800">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Noto+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="./styles.css">
</head>
<body>
  <div class="wrap">
    <header class="masthead">
      <p class="kicker"><span>Multi-source AI news</span><span>Every 3 hours</span></p>
      <h1>Ai Source</h1>
      <p class="dateline">
        <strong>${escapeHtml(refreshed)}</strong>
        <span>Top ${clusterCount} story clusters right now</span>
      </p>
      ${filterBar()}
    </header>
    <main class="grid" id="story-grid">
      ${stories || empty}
    </main>
    <p class="status">Last refresh: ${escapeHtml(refreshed)} · ${escapeHtml(sourcesLine)}</p>
    <footer>Ai Source aggregates headlines from TechCrunch, VentureBeat, The Verge, AI/TLDR, The Signal, and X, then clusters the same event across outlets. Original posts stay on their publishers’ sites.</footer>
  </div>
<script>
(function () {
  var bar = document.querySelector(".filters");
  var cards = document.querySelectorAll("#story-grid .story");
  if (!bar) return;
  bar.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-filter]");
    if (!btn) return;
    var filter = btn.getAttribute("data-filter");
    bar.querySelectorAll(".chip").forEach(function (c) {
      c.classList.toggle("is-on", c === btn);
    });
    cards.forEach(function (card) {
      var tags = (card.getAttribute("data-tags") || "").split(/\\s+/).filter(Boolean);
      card.hidden = filter !== "all" && tags.indexOf(filter) === -1;
    });
  });
})();
</script>
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
  const xPromise = harvestX();
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
  const { items: xItems, errors: xErrors } = await xPromise;
  sourceStats.push({
    id: X_SOURCE.id,
    name: X_SOURCE.name,
    ok: xItems.length > 0,
    count: xItems.length,
    errors: xErrors,
  });
  if (xErrors.length) console.error("x", xErrors.join("; "));
  all.push(...xItems);

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

export { clusterStories, deriveTags, pickTop, topicKey };

const isDirect =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) {
  const payload = await refreshNews();
  console.log(
    `Wrote ${payload.posts.length} clusters (${payload.posts.filter((p) => p.curated).length} curated-led, ${payload.posts.filter((p) => p.sourceId === "x").length} X-only, ${payload.posts.filter((p) => (p.clusterSize || 1) > 1).length} multi-source)`,
  );
}
