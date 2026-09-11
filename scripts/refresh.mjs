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
const FEED_TOP_CAP = 2;
const RUMOR_CAP = 4;
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
  {
    id: "decoder",
    name: "THE DECODER",
    home: "https://the-decoder.com/",
    feeds: ["https://the-decoder.com/feed/"],
  },
  {
    id: "huggingface",
    name: "Hugging Face Blog",
    home: "https://huggingface.co/blog",
    feeds: ["https://huggingface.co/blog/feed.xml"],
  },
  {
    id: "siliconangle",
    name: "SiliconANGLE",
    home: "https://siliconangle.com/",
    feeds: ["https://siliconangle.com/feed/"],
  },
  {
    id: "reuters",
    name: "Reuters",
    home: "https://www.reuters.com/technology/artificial-intelligence/",
    feeds: [
      "https://www.reuters.com/technology/artificial-intelligence/",
      "https://news.google.com/rss/search?q=site:reuters.com+(AI+OR+artificial+intelligence+OR+OpenAI+OR+Anthropic+OR+GPT)+when:3d&hl=en-US&gl=US&ceid=US:en",
    ],
  },
  {
    id: "arstechnica",
    name: "Ars Technica",
    home: "https://arstechnica.com/tag/artificial-intelligence/",
    feeds: ["https://arstechnica.com/tag/artificial-intelligence/feed/"],
  },
  {
    id: "ieee-spectrum",
    name: "IEEE Spectrum",
    home: "https://spectrum.ieee.org/topic/artificial-intelligence/",
    feeds: ["https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss"],
  },
  {
    id: "openai",
    name: "OpenAI News",
    home: "https://openai.com/news/",
    feeds: ["https://openai.com/news/rss.xml"],
  },
  {
    id: "deepmind",
    name: "Google DeepMind",
    home: "https://deepmind.google/blog/",
    feeds: ["https://deepmind.google/blog/rss.xml"],
  },
  {
    id: "google-ai",
    name: "Google AI Blog",
    home: "https://blog.google/technology/ai/",
    feeds: ["https://blog.google/technology/ai/rss/"],
  },
  {
    id: "nvidia",
    name: "NVIDIA Blog",
    home: "https://blogs.nvidia.com/blog/category/generative-ai/",
    feeds: ["https://blogs.nvidia.com/blog/category/generative-ai/feed/"],
  },
  {
    id: "futurism",
    name: "Futurism",
    home: "https://futurism.com/categories/ai-artificial-intelligence",
    feeds: ["https://futurism.com/categories/ai-artificial-intelligence/feed"],
  },
  {
    id: "import-ai",
    name: "Import AI",
    home: "https://importai.substack.com/",
    feeds: ["https://importai.substack.com/feed"],
  },
  {
    id: "lastweekinai",
    name: "Last Week in AI",
    home: "https://lastweekin.ai/",
    feeds: ["https://lastweekin.ai/feed"],
  },
  {
    id: "gizmodo",
    name: "Gizmodo",
    home: "https://gizmodo.com/tech/artificial-intelligence",
    feeds: ["https://gizmodo.com/tech/artificial-intelligence/rss"],
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

function isFreshHarvest(harvestedAt) {
  return Boolean(harvestedAt) && Date.now() - harvestedAt <= CURATED_MAX_AGE_MS;
}

function hasRumorTag(item) {
  return (item.tags || []).some(
    (t) => String(t).toLowerCase().trim() === "rumor",
  );
}

function isXShaped(item) {
  const kind = String(item.sourceKind || item.sourceId || "").toLowerCase();
  if (kind === "x" || kind === "twitter") return true;
  const url = String(item.url || "");
  if (/^https?:\/\/(www\.)?(x|twitter)\.com\//i.test(url)) return true;
  return false;
}

function normalizeVia(item) {
  const raw = String(item.via || item.authorHandle || "").trim();
  if (raw) return raw.startsWith("@") ? raw : `@${raw.replace(/^@+/, "")}`;
  try {
    const parsed = new URL(item.url);
    if (/(^|\.)(x|twitter)\.com$/i.test(parsed.hostname)) {
      const handle = parsed.pathname.split("/").filter(Boolean)[0];
      if (handle && handle !== "i" && handle !== "status") return `@${handle}`;
    }
  } catch {
    /* keep */
  }
  return "@x";
}

function toRumorItem(item, fallbackHarvestedAt) {
  const when =
    item.harvestedAt || item.publishedAt || fallbackHarvestedAt || null;
  const ts = when ? Date.parse(when) : 0;
  return {
    id: `rumor:${normalizeUrl(item.url)}`,
    title: item.title,
    summary: item.summary || summaryFrom(item.title),
    url: item.url,
    via: normalizeVia(item),
    sourceKind: "x",
    sourceId: "x",
    sourceName: "X",
    harvestedAt: when,
    publishedAt: when,
    publishedTs: Number.isNaN(ts) ? 0 : ts,
    tags: ["rumor"],
  };
}

function rumorIsConfirmed(rumor, clusters) {
  const url = normalizeUrl(rumor.url);
  const tokens = titleTokens(rumor);
  for (const cluster of clusters) {
    const urls = [cluster.url, ...(cluster.related || []).map((r) => r.url)].map(
      normalizeUrl,
    );
    if (urls.includes(url)) return true;
    const outlets = new Set([
      cluster.sourceId,
      ...(cluster.related || []).map((r) => r.sourceId),
    ]);
    const multi = (cluster.clusterSize || outlets.size) > 1;
    if (multi && jaccard(tokens, titleTokens(cluster)) >= 0.4) return true;
  }
  return false;
}

function pickRumors(harvestRumors, clusters) {
  const pool = harvestRumors;
  const seen = new Set();
  const picked = [];
  const ranked = [...pool].sort(
    (a, b) =>
      (b.publishedTs || 0) - (a.publishedTs || 0) ||
      a.title.localeCompare(b.title),
  );
  for (const rumor of ranked) {
    const key = normalizeUrl(rumor.url);
    if (!key || seen.has(key)) continue;
    if (rumorIsConfirmed(rumor, clusters)) continue;
    seen.add(key);
    picked.push(rumor);
    if (picked.length >= RUMOR_CAP) break;
  }
  return picked;
}

async function loadCurated() {
  try {
    const raw = await readFile(CURATED_PATH, "utf8");
    const data = JSON.parse(raw);
    const harvestedAt = data.harvestedAt ? Date.parse(data.harvestedAt) : 0;
    const fresh = isFreshHarvest(harvestedAt);
    if (harvestedAt && !fresh) {
      console.error(
        "Curated harvest is older than 2h; ranking it with live feeds (no lead preference)",
      );
    }
    const posts = Array.isArray(data.posts) ? data.posts : [];
    const confirmed = [];
    const rumorPosts = [];
    for (const p of posts) {
      if (!p || !p.title || !p.url) continue;
      if (hasRumorTag(p)) {
        if (isXShaped(p)) rumorPosts.push(p);
        continue;
      }
      confirmed.push(p);
    }
    const rumorList = [
      ...(Array.isArray(data.rumors) ? data.rumors : []),
      ...rumorPosts,
    ].filter((p) => p && p.title && p.url && isXShaped(p));
    return {
      fresh,
      harvestedAt,
      posts: confirmed.map((p, i) => ({
        id: `curated:${p.url}`,
        url: p.url,
        title: p.title,
        summary: p.summary || summaryFrom(p.title),
        sourceId: p.sourceId || "curated",
        sourceName: p.sourceName || "Curated",
        sourceHome: p.sourceHome || p.url,
        publishedAt: p.publishedAt || data.harvestedAt || null,
        // Curated Top-10 ranking uses harvest order, not article age.
        publishedTs: (harvestedAt || Date.now()) - i,
        publishGuess: !p.publishedAt,
        curated: fresh,
        tags: Array.isArray(p.tags) ? p.tags : undefined,
        clusterId:
          typeof p.clusterId === "string" && p.clusterId.trim()
            ? p.clusterId.trim()
            : undefined,
      })),
      rumors: rumorList.map((p) => toRumorItem(p, data.harvestedAt)),
    };
  } catch {
    return { fresh: false, harvestedAt: 0, posts: [], rumors: [] };
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
    const googleReal = link.match(/[?&]url=([^&]+)/);
    if (googleReal) {
      try {
        link = decodeURIComponent(googleReal[1]);
      } catch {
        /* keep */
      }
    }
    // Google News article wrappers often can't be unwrapped without JS — drop them.
    if (/^https?:\/\/(news\.)?google\.com\//i.test(link)) continue;
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
    if (/news\.ycombinator\.com/i.test(link)) continue;
    if (/\b\d+\s*pts?\b.*\bcomments?\b.*\bHN\b/i.test(title)) continue;
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
    // Signal/Prismix pages often link out to HN threads — don't mislabel them as The Signal.
    if (/news\.ycombinator\.com/i.test(url)) continue;
    if (/\b\d+\s*pts?\b.*\bcomments?\b.*\bHN\b/i.test(title)) continue;
    if (/^\d+\s*pts?\s*[·•]/i.test(title)) continue;
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
      // "x" is a source filter, not a topic tag — mixed clusters must not inherit it.
      if (id && id !== "x") out.add(id);
    }
  }
  const h = hay(post);
  if (
    /\b(agent|agents|agentic|coworker|astra|collusion|swarm|orchestrat|mcp|playwright|computer use|computer-use|nemo claw|nemoclaw|hydrafusion|armature|personal agent|autonom)\b/.test(
      h,
    )
  ) {
    out.add("agents");
  }
  if (
    /\b(model|models|chatgpt|chat gpt|gemini|gpt-?\d*|claude|qwen|llada|llm|llms|open.?weight|open.?source model|cerebras|tinker|muse spark|transcribe|openai|anthropic|mistral|deepseek|llama|diffusion|image model|foundation model|frontier model)\b/.test(
      h,
    )
  ) {
    out.add("model-releases");
  }
  if (
    /\b(fund|funding|raises|raised|series [a-z]|ipo|coatue|a16z|andreessen|accel|round|seed|valuation|bags? \$?\d|\$\d[\d.,]*\s*(m|b|million|billion)|million|billion|grow an?|revenue|capex)\b/.test(
      h,
    )
  ) {
    out.add("funding");
  }
  if (
    /\b(research|paper|arxiv|benchmark|study|lean|fermat|abliteration|wiki|wikipedia|collusion|proof|millennium|navier|stokes|equation|atlas|genome|threat intelligence)\b/.test(
      h,
    )
  ) {
    out.add("research");
  }
  if (
    /\b(ftc|sec|lawsuit|court|nyt|new york times|label|labels|disclos|regulat|copyright|energy grid|power grid|congress|white house|export control|sanctions|sovereign|diplomacy)\b/.test(
      h,
    ) ||
    (/\bpolicy\b/.test(h) && !/\bpolicy-gated\b/.test(h))
  ) {
    out.add("policy");
  }
  // Every story card must carry at least one topic chip.
  if (out.size === 0) {
    if (/\b(nvidia|gpu|chip|semiconductor|datacenter|data centre|infra)\b/.test(h)) {
      out.add("model-releases");
    } else if (/\b(ai|artificial intelligence|machine learning|genai)\b/.test(h)) {
      out.add("research");
    } else {
      out.add("research");
    }
  }
  return TAG_IDS.filter((id) => out.has(id) && id !== "x");
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

function bestPublishedIso(items) {
  let bestIso = null;
  let bestTs = Infinity;
  let fallbackIso = null;
  let fallbackTs = Infinity;
  for (const p of items) {
    const iso = publishedIso(p);
    if (!iso) continue;
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) continue;
    if (ts < fallbackTs) {
      fallbackTs = ts;
      fallbackIso = iso;
    }
    // Prefer real article dates over harvest-time guesses.
    if (!p.publishGuess && ts < bestTs) {
      bestTs = ts;
      bestIso = iso;
    }
  }
  return bestIso || fallbackIso;
}

function toCluster(items, clusterId) {
  const sorted = [...items].sort(compareStories);
  const lead = sorted[0];
  const related = uniqueRelated(sorted, lead);
  // Prefer the lead story's own article clock when known; else earliest real date in the cluster.
  const leadIso = !lead.publishGuess ? publishedIso(lead) : null;
  const publishedAt = leadIso || bestPublishedIso(sorted) || publishedIso(lead);
  return {
    ...lead,
    publishedAt,
    publishedTs: lead.curated
      ? lead.publishedTs || 0
      : publishedAt
        ? Date.parse(publishedAt)
        : lead.publishedTs || 0,
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

function mergeByUrl(items, preferCurated) {
  const byUrl = new Map();
  for (const item of items.filter(looksLikeAiStory)) {
    const key = normalizeUrl(item.url);
    const prev = byUrl.get(key);
    if (!prev) {
      byUrl.set(key, item);
      continue;
    }
    if (preferCurated) {
      if (item.curated && !prev.curated) {
        byUrl.set(key, {
          ...item,
          publishedAt: (!item.publishGuess && item.publishedAt) || prev.publishedAt || item.publishedAt,
          publishedTs: (!item.publishGuess && item.publishedTs) || prev.publishedTs || item.publishedTs,
          publishGuess: item.publishGuess && !prev.publishedAt ? true : !((!item.publishGuess && item.publishedAt) || prev.publishedAt),
        });
        continue;
      }
      if (prev.curated && !item.curated) {
        byUrl.set(key, {
          ...prev,
          publishedAt: item.publishedAt || prev.publishedAt,
          publishedTs: item.publishedTs || prev.publishedTs,
          publishGuess: item.publishedAt ? false : prev.publishGuess,
        });
        continue;
      }
    }
    if (item.publishedTs > prev.publishedTs) byUrl.set(key, item);
  }
  return [...byUrl.values()];
}

function pickTop(items, preferCurated = false) {
  const clusters = clusterStories(mergeByUrl(items, preferCurated));
  const xPool = clusters
    .filter((item) => item.sourceId === X_SOURCE.id)
    .sort(
      (a, b) =>
        (b.score || 0) - (a.score || 0) || b.publishedTs - a.publishedTs,
    );
  const curatedPool = clusters
    .filter((item) => item.curated)
    .sort(compareStories);
  const feedPool = clusters
    .filter((item) => !item.curated && item.sourceId !== X_SOURCE.id)
    .sort(
      (a, b) =>
        b.publishedTs - a.publishedTs || a.title.localeCompare(b.title),
    );
  const recencyPool = clusters
    .filter((item) => item.sourceId !== X_SOURCE.id)
    .sort(
      (a, b) =>
        b.publishedTs - a.publishedTs || a.title.localeCompare(b.title),
    );

  const perSource = new Map();
  const xAuthors = new Set();
  const picked = [];
  const take = (pool, limit) => {
    if (limit <= 0) return;
    const extra = pickDiverse(
      pool.filter((item) => !picked.includes(item)),
      limit,
      perSource,
      xAuthors,
    );
    picked.push(...extra);
  };

  if (preferCurated && curatedPool.length) {
    const xReserve = Math.min(X_TOP_CAP, TOP_N);
    const feedReserve = Math.min(FEED_TOP_CAP, Math.max(0, TOP_N - xReserve));
    take(curatedPool, TOP_N - xReserve - feedReserve);
    take(feedPool, TOP_N - picked.length - xReserve);
    take(xPool, xReserve);
    take(curatedPool, TOP_N - picked.length);
    take(feedPool, TOP_N - picked.length);
  } else {
    take(xPool, X_TOP_CAP);
    take(recencyPool, TOP_N - picked.length);
  }
  take(clusters, TOP_N - picked.length);
  if (!preferCurated) {
    picked.sort(
      (a, b) =>
        b.publishedTs - a.publishedTs || a.title.localeCompare(b.title),
    );
  }
  return picked.slice(0, TOP_N);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const DISPLAY_TIME_ZONE = "Australia/Sydney";
const DISPLAY_TIME_FORMAT = {
  timeZone: DISPLAY_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZoneName: "short",
};
const DISPLAY_CLOCK_FORMAT = {
  ...DISPLAY_TIME_FORMAT,
  second: "2-digit",
};

function formatWhen(iso) {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-AU", DISPLAY_TIME_FORMAT).format(date);
}

function formatClock(iso) {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-AU", DISPLAY_CLOCK_FORMAT).format(date);
}

function timeHtml(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const text = formatWhen(iso);
  if (!text) return "";
  return `<time datetime="${escapeHtml(date.toISOString())}">${escapeHtml(text)}</time>`;
}

function publishedIso(post) {
  return (
    post.publishedAt ||
    (post.publishedTs ? new Date(post.publishedTs).toISOString() : null)
  );
}

function dateFromUrl(url) {
  const s = String(url || "");
  // /2026/09/10/ or -2026-09-10 or _2026-09-10
  let m = s.match(/[\/_-](20\d{2})[\/-](\d{2})[\/-](\d{2})(?:[\/_-]|$)/);
  if (!m) m = s.match(/\b(20\d{2})(\d{2})(\d{2})\b/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // Noon UTC on that calendar day — better than harvest stamp when exact time unknown.
  const iso = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0)).toISOString();
  return Number.isNaN(Date.parse(iso)) ? null : iso;
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

function formatAge(iso) {
  const ts = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(ts)) return "";
  const hours = Math.max(0, Math.round((Date.now() - ts) / 3_600_000));
  if (hours < 1) return "now";
  if (hours < 24) return `${hours}h`;
  return `${Math.max(1, Math.round(hours / 24))}d`;
}

function filterBar() {
  const chips = [
    ["all", "All"],
    ...TAG_IDS.map((id) => [id, TAG_LABELS[id]]),
    ["rumors", "Rumors"],
  ]
    .map(([id, label], i) => {
      const extra = id === "rumors" ? " chip-rumor" : "";
      return `<button type="button" class="chip${extra}${i === 0 ? " is-on" : ""}" data-filter="${id}">${label}</button>`;
    })
    .join("");
  return `<nav class="filters" aria-label="Story filters">${chips}</nav>`;
}

function rumorViaHref(rumor) {
  const handle = String(rumor.via || "")
    .replace(/^@+/, "")
    .trim();
  if (handle && handle !== "x") return `https://x.com/${encodeURIComponent(handle)}`;
  const url = String(rumor.url || "");
  if (/^https?:\/\/(www\.)?(x|twitter)\.com\//i.test(url)) return url;
  return "https://x.com";
}

function rumorCard(rumor) {
  const iso = rumor.harvestedAt || rumor.publishedAt;
  const stamp = timeHtml(iso);
  const age = formatAge(iso);
  const when = ["X", stamp || escapeHtml(age)].filter(Boolean).join(" · ");
  const viaHref = rumorViaHref(rumor);
  return `<article class="rumor">
  <div class="rumor-kicker">
    <span class="rumor-flag">Rumor</span>
    <span class="rumor-when">${when}</span>
  </div>
  <h3><a href="${escapeHtml(rumor.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(rumor.title)}</a></h3>
  <p class="rumor-via">Via <a href="${escapeHtml(viaHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(rumor.via)}</a></p>
</article>`;
}

function rumorMill(rumors) {
  const cards = rumors.map(rumorCard).join("\n");
  const body =
    cards ||
    `<p class="rumor-empty">No unconfirmed X rumors right now.</p>`;
  return `<section class="rumor-mill" data-panel="rumors">
  <div class="rumor-mill-head">
    <h2>Rumor mill</h2>
    <span class="unconfirmed">Unconfirmed</span>
  </div>
  <p class="rumor-explainer">Whispers and leak-adjacent chatter. Not in the Top 10 until confirmed across outlets.</p>
  <div class="rumor-list">${body}</div>
</section>`;
}

function renderHtml(payload) {
  const stories = payload.posts
    .map((post, index) => {
      const rank = String(index + 1).padStart(2, "0");
      const iso = publishedIso(post);
      const when = timeHtml(iso);
      const isX = post.sourceId === X_SOURCE.id;
      const handle = post.authorHandle ? `@${post.authorHandle}` : "";
      const cta = isX ? "Read on X →" : "Read story →";
      const meta = [
        handle ? `<span>${escapeHtml(handle)}</span>` : "",
      ]
        .filter(Boolean)
        .join("\n      ");
      const topicTags = (post.tags || []).filter((t) => t !== "x");
      const tags = topicTags.join(" ");
      const size = post.clusterSize > 1 ? `<span>${post.clusterSize} sources</span>` : "";
      const shareX = `https://twitter.com/intent/tweet?url=${encodeURIComponent(post.url || "")}&text=${encodeURIComponent(post.title || "")}`;
      const shareFb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(post.url || "")}`;
      const shareReddit = `https://www.reddit.com/submit?url=${encodeURIComponent(post.url || "")}&title=${encodeURIComponent(post.title || "")}`;
      return `<article class="story" data-tags="${escapeHtml(tags)}" data-source="${escapeHtml(post.sourceId || "")}">
  <div class="rank">${rank}</div>
  <div>
    <div class="story-top">
      <div class="source-block">
        <p class="source"><a href="${escapeHtml(post.sourceHome)}" target="_blank" rel="noopener noreferrer">${escapeHtml(post.sourceName)}</a></p>
        ${when ? `<p class="published">Published ${when}</p>` : `<p class="published published-unknown">Published time unavailable</p>`}
      </div>
      <details class="share-wrap">
        <summary class="share-pill" aria-label="Share story">
          <svg class="share-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/></svg>
          <span class="share-label">Share</span>
        </summary>
        <div class="share-menu" role="menu">
          <a class="share-menu-item" role="menuitem" href="${escapeHtml(shareX)}" target="_blank" rel="noopener noreferrer">Share on X</a>
          <a class="share-menu-item" role="menuitem" href="${escapeHtml(shareFb)}" target="_blank" rel="noopener noreferrer">Share on Facebook</a>
          <a class="share-menu-item" role="menuitem" href="${escapeHtml(shareReddit)}" target="_blank" rel="noopener noreferrer">Share on Reddit</a>
        </div>
      </details>
    </div>
    <h2><a href="${escapeHtml(post.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(post.title)}</a></h2>
    <div class="meta">
      ${[meta, size].filter(Boolean).join("\n      ")}
    </div>
  </div>
  <p class="body">${escapeHtml(post.summary)}</p>
  ${tagPills(topicTags)}
  <div class="stats">
    <a class="x-link" href="${escapeHtml(post.url)}" target="_blank" rel="noopener noreferrer">${cta}</a>
  </div>
</article>`;
    })
    .join("\n");

  const empty =
    `<div class="empty">No stories made it through this harvest. The next refresh will try again.</div>`;
  const refreshed = timeHtml(payload.refreshedAt);
  const clockNow = new Date();
  const clockIso = clockNow.toISOString();
  const clockText = formatClock(clockIso);
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
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="mobile-web-app-capable" content="yes">
  <script>
  (function () {
    try {
      var savedTheme = localStorage.getItem("ai-source-theme");
      if (savedTheme === "light" || savedTheme === "dark") {
        document.documentElement.setAttribute("data-theme", savedTheme);
      }
    } catch (error) {
      /* Theme persistence is optional when storage is unavailable. */
    }
  })();
  </script>
  <title>Ai Source — AI news</title>
  <meta name="description" content="Top AI news from TechCrunch, VentureBeat, The Verge, Reuters, Ars Technica, IEEE Spectrum, OpenAI, DeepMind, Google, NVIDIA, Futurism, Import AI, Last Week in AI, Gizmodo, and more.">
  <meta http-equiv="refresh" content="1800">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Noto+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="./styles.css?v=published-3">
  <link rel="icon" href="./favicon.ico" sizes="any">
  <link rel="icon" type="image/png" sizes="32x32" href="./favicon-32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="./favicon-16.png">
  <link rel="apple-touch-icon" sizes="180x180" href="./apple-touch-icon.png">
  <link rel="manifest" href="./site.webmanifest">
</head>
<body data-refreshed-at="${escapeHtml(payload.refreshedAt || "")}">
  <div class="wrap">
    <header class="masthead">
      <div class="masthead-top">
        <p class="kicker"><span>Many outlets · one briefing</span></p>
        <div class="masthead-aside">
          <div class="masthead-controls">
            <button type="button" class="theme-toggle" id="theme-toggle" aria-label="Switch to light theme" aria-pressed="false">☀ Light</button>
          </div>
        </div>
      </div>
      <h1>Ai Source</h1>
      <p class="dateline">
        <span>What matters in AI today — clustered from many sources · refreshed ${refreshed}</span>
      </p>
      ${filterBar()}
    </header>
    ${rumorMill(payload.rumors || [])}
    <h2 class="confirmed-label">Confirmed · Top story clusters</h2>
    <main class="grid" id="story-grid">
      ${stories || empty}
      <div class="empty" id="filter-empty" hidden>No stories in this category right now.</div>
    </main>
    <p class="status">Last refresh: ${refreshed}</p>
    <footer>Your AI feed without the tab tax: we cluster the noise, you keep the links.</footer>
  </div>
<script>
(function () {
  var toggle = document.getElementById("theme-toggle");
  if (!toggle) return;

  function applyTheme(theme) {
    var isLight = theme === "light";
    document.documentElement.setAttribute("data-theme", isLight ? "light" : "dark");
    toggle.setAttribute("aria-pressed", String(isLight));
    toggle.setAttribute("aria-label", isLight ? "Switch to dark theme" : "Switch to light theme");
    toggle.textContent = isLight ? "☾ Dark" : "☀ Light";
  }

  var initialTheme =
    document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  applyTheme(initialTheme);

  toggle.addEventListener("click", function () {
    var nextTheme =
      document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    applyTheme(nextTheme);
    try {
      localStorage.setItem("ai-source-theme", nextTheme);
    } catch (error) {
      /* Keep the in-page switch working when storage is unavailable. */
    }
  });
})();
(function () {
  var fmt = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short"
  });
  document.querySelectorAll("time[datetime]:not(#sydney-clock)").forEach(function (el) {
    var date = new Date(el.getAttribute("datetime"));
    if (!isNaN(date.getTime())) el.textContent = fmt.format(date);
  });
})();
(function () {
  var clock = document.getElementById("sydney-clock");
  if (!clock) return;
  var fmt = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short"
  });
  function tick() {
    var now = new Date();
    clock.setAttribute("datetime", now.toISOString());
    clock.textContent = fmt.format(now);
  }
  tick();
  setInterval(tick, 1000);
})();
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
    var mill = document.querySelector(".rumor-mill");
    var confirmed = document.querySelector(".confirmed-label");
    var visible = 0;
    if (filter === "rumors") {
      if (mill) mill.hidden = false;
      if (confirmed) confirmed.hidden = true;
      cards.forEach(function (card) { card.hidden = true; });
      visible = mill ? 1 : 0;
    } else {
      if (mill) mill.hidden = filter !== "all";
      if (confirmed) confirmed.hidden = false;
      cards.forEach(function (card) {
        var tags = (card.getAttribute("data-tags") || "").split(/\\s+/).filter(Boolean);
        var source = card.getAttribute("data-source") || "";
        var show =
          filter === "all" ||
          (filter === "x" ? source === "x" : tags.indexOf(filter) !== -1);
        card.hidden = !show;
        if (show) visible += 1;
      });
    }
    var empty = document.getElementById("filter-empty");
    if (empty) empty.hidden = visible > 0;
  });
})();

(function () {
  document.addEventListener("click", function (e) {
    document.querySelectorAll("details.share-wrap[open]").forEach(function (d) {
      if (!d.contains(e.target)) d.removeAttribute("open");
    });
  });
})();

(function () {
  var baked = document.body.getAttribute("data-refreshed-at") || "";
  var checking = false;
  function checkFresh() {
    if (checking) return;
    checking = true;
    var url = "./data/news.json?t=" + Date.now();
    fetch(url, { cache: "no-store", headers: { "Cache-Control": "no-cache" } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        checking = false;
        if (!data || !data.refreshedAt) return;
        if (baked && data.refreshedAt !== baked) {
          var u = new URL(window.location.href);
          u.searchParams.set("r", String(Date.now()));
          window.location.replace(u.toString());
        }
      })
      .catch(function () { checking = false; });
  }
  // Home-screen / bfcache: recheck when returning to the app
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) checkFresh();
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") checkFresh();
  });
  // Also check shortly after open (covers cold start from cached HTML)
  window.setTimeout(checkFresh, 800);
  // Light poll while the app stays open (harvest is ~3h; 5 min is enough)
  window.setInterval(checkFresh, 5 * 60 * 1000);
})();
</script>
</body>
</html>
`;
}

export async function refreshNews() {
  const curated = await loadCurated();
  const all = [...curated.posts];
  const sourceStats = [];
  if (curated.posts.length) {
    sourceStats.push({
      id: "curated",
      name: curated.fresh ? "Evan harvest" : "Evan harvest (expired)",
      ok: true,
      count: curated.posts.length,
      errors: curated.fresh
        ? []
        : ["older than 2h; ranked with live feeds"],
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

  // Backfill real pubDates onto curated harvest rows from live-feed twins.
  for (const curatedPost of all.filter((p) => p.curated && p.publishGuess)) {
    let best = null;
    let bestScore = 0;
    for (const live of all) {
      if (live.curated || live.publishGuess || !live.publishedAt) continue;
      if (live.sourceId === X_SOURCE.id) continue;
      const sameUrl = normalizeUrl(live.url) === normalizeUrl(curatedPost.url);
      const score = sameUrl ? 1 : jaccard(titleTokens(curatedPost), titleTokens(live));
      if (score < (sameUrl ? 0.99 : 0.55)) continue;
      if (score > bestScore) {
        bestScore = score;
        best = live;
      }
    }
    if (best) {
      curatedPost.publishedAt = best.publishedAt;
      // Keep curated harvest-order ranking; only refresh display date.
      curatedPost.publishGuess = false;
    }
  }

  for (const item of all) {
    if (item.publishedAt && !item.publishGuess) continue;
    const fromUrl = dateFromUrl(item.url);
    if (!fromUrl) continue;
    item.publishedAt = fromUrl;
    // Keep curated harvest order for ranking; only live-feed rows re-rank by pub date.
    if (!item.curated) item.publishedTs = Date.parse(fromUrl);
    item.publishGuess = false;
    item.publishFromUrl = true;
  }

  const posts = pickTop(all, curated.fresh);
  const rumors = pickRumors(curated.rumors || [], posts);
  if (rumors.length) {
    sourceStats.push({
      id: "rumors",
      name: "Rumor mill (X)",
      ok: true,
      count: rumors.length,
      errors: [],
    });
  }
  const payload = {
    source: "multi",
    sources: sourceStats,
    briefingDate: new Date().toISOString(),
    refreshedAt: new Date().toISOString(),
    preferCurated: curated.fresh,
    posts,
    rumors,
  };
  await mkdir(dirname(DATA_PATH), { recursive: true });
  await writeFile(DATA_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(INDEX_PATH, renderHtml(payload));
  return payload;
}

export {
  clusterStories,
  deriveTags,
  formatClock,
  formatWhen,
  isFreshHarvest,
  loadCurated,
  pickRumors,
  pickTop,
  renderHtml,
  topicKey,
};

const isDirect =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) {
  const payload = await refreshNews();
  console.log(
    `Wrote ${payload.posts.length} clusters + ${(payload.rumors || []).length} rumors (${payload.posts.filter((p) => p.curated).length} curated-led, ${payload.posts.filter((p) => !p.curated && p.sourceId !== "x").length} live-feed, ${payload.posts.filter((p) => p.sourceId === "x").length} X-only, ${payload.posts.filter((p) => (p.clusterSize || 1) > 1).length} multi-source, preferCurated=${payload.preferCurated})`,
  );
}
