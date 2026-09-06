import assert from "node:assert/strict";
import { test } from "node:test";
import { formatClock, formatWhen, renderHtml } from "./refresh.mjs";

test("formats September UTC ISO as Sydney AEST, not a raw Z string", () => {
  const text = formatWhen("2026-09-05T20:13:11.116Z");
  assert.match(text, /6 Sept 2026/);
  assert.match(text, /6:13\s*am/i);
  assert.match(text, /AEST/);
  assert.doesNotMatch(text, /Z$/);
  assert.doesNotMatch(text, /20:13/);
});

test("formats January UTC ISO as Sydney AEDT", () => {
  const text = formatWhen("2026-01-15T03:00:00.000Z");
  assert.match(text, /15 Jan 2026/);
  assert.match(text, /2:00\s*pm/i);
  assert.match(text, /AEDT/);
});

test("renderHtml shows Sydney labels and keeps UTC only in datetime", () => {
  const html = renderHtml({
    refreshedAt: "2026-09-05T20:13:11.116Z",
    posts: [
      {
        publishedAt: "2026-09-05T20:10:00.000Z",
        title: "Test story",
        url: "https://example.com/story",
        sourceHome: "https://example.com",
        sourceName: "Example",
        sourceId: "example",
        summary: "Hello",
        tags: [],
        clusterSize: 1,
      },
    ],
    rumors: [
      {
        harvestedAt: "2026-09-05T20:10:00.000Z",
        title: "Test rumor",
        url: "https://x.com/a/status/1",
        via: "@a",
        summary: "Caveat",
      },
    ],
    sources: [],
  });
  assert.match(html, /Australia\/Sydney/);
  assert.match(html, /datetime="2026-09-05T20:13:11\.116Z"/);
  assert.match(html, /6:13\s*am AEST/);
  assert.match(html, /6:10\s*am AEST/);
  const visible = html.replace(/datetime="[^"]+"/g, "");
  assert.doesNotMatch(visible, /20:13:11\.116Z/);
  assert.doesNotMatch(visible, /20:10:00\.000Z/);
});

test("renderHtml formats publishedTs when publishedAt is null", () => {
  const html = renderHtml({
    refreshedAt: "2026-09-05T22:25:21.456Z",
    posts: [
      {
        publishedAt: null,
        publishedTs: Date.parse("2026-09-05T20:13:11.116Z"),
        title: "Signal scraped story",
        url: "https://news.ycombinator.com/item?id=49578866",
        sourceHome: "https://infinitytechstack.uk/ai-signal",
        sourceName: "The Signal",
        sourceId: "signal",
        summary: "Scraped without ISO date",
        tags: [],
        clusterSize: 1,
      },
    ],
    rumors: [],
    sources: [],
  });
  assert.match(html, /datetime="2026-09-05T20:13:11\.116Z"/);
  assert.match(html, /6:13\s*am AEST/);
});

test("formatClock includes seconds and Sydney AEST/AEDT labels", () => {
  const aest = formatClock("2026-09-05T20:13:11.116Z");
  assert.match(aest, /6 Sept 2026/);
  assert.match(aest, /6:13:11\s*am/i);
  assert.match(aest, /AEST/);
  const aedt = formatClock("2026-01-15T03:00:00.000Z");
  assert.match(aedt, /15 Jan 2026/);
  assert.match(aedt, /2:00:00\s*pm/i);
  assert.match(aedt, /AEDT/);
});

test("renderHtml places a live Sydney clock above the refresh cadence", () => {
  const html = renderHtml({
    refreshedAt: "2026-09-05T20:13:11.116Z",
    posts: [],
    rumors: [],
    sources: [],
  });
  const masthead = html.match(/<header class="masthead">[\s\S]*?<\/header>/)[0];
  const clockAt = masthead.indexOf('id="sydney-clock"');
  const cadenceAt = masthead.indexOf("Every 3 hours");
  assert.ok(clockAt !== -1 && cadenceAt !== -1);
  assert.ok(clockAt < cadenceAt);
  assert.match(html, /timeZone:\s*"Australia\/Sydney"/);
  assert.match(html, /timeZoneName:\s*"short"/);
  assert.match(html, /setInterval\(tick,\s*1000\)/);
  assert.match(html, /time\[datetime\]:not\(#sydney-clock\)/);
  assert.match(html, /data-filter="rumors"/);
  assert.match(html, /class="rumor-mill"/);
});

test("renderHtml includes a persistent theme switch with dark as the default", () => {
  const html = renderHtml({
    refreshedAt: "2026-09-05T20:13:11.116Z",
    posts: [],
    rumors: [],
    sources: [],
  });
  const bootstrapAt = html.indexOf('localStorage.getItem("ai-source-theme")');
  const stylesheetAt = html.indexOf('<link rel="stylesheet" href="./styles.css">');
  assert.ok(bootstrapAt !== -1 && bootstrapAt < stylesheetAt);
  assert.match(html, /id="theme-toggle"/);
  assert.match(html, /aria-label="Switch to light theme"/);
  assert.match(html, /localStorage\.setItem\("ai-source-theme", nextTheme\)/);
  assert.match(
    html,
    /getAttribute\("data-theme"\) === "light" \? "light" : "dark"/,
  );
});

test("renderHtml does not invent a story time without publishedAt or publishedTs", () => {
  const html = renderHtml({
    refreshedAt: "2026-09-05T22:25:21.456Z",
    posts: [
      {
        title: "Evan harvest story",
        url: "https://example.com/no-date",
        sourceHome: "https://example.com",
        sourceName: "Curated",
        sourceId: "curated",
        summary: "No date fields",
        tags: [],
        clusterSize: 1,
      },
    ],
    rumors: [],
    sources: [],
  });
  const story = html.match(/<article class="story"[\s\S]*?<\/article>/)[0];
  assert.doesNotMatch(story, /<time/);
  assert.match(html, /datetime="2026-09-05T22:25:21\.456Z"/);
});
