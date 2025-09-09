// scripts/generate_cfb_posts.mjs
import fs from "node:fs";

// ESPN FBS scoreboard (no key required)
const BASE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80";

// Grab the last 2 days of games so you always have finals, even midweek
const LOOKBACK_DAYS = 2;
const end = fmtYMD(new Date());
const start = fmtYMD(new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600e3));
const SCOREBOARD = `${BASE}&dates=${start}-${end}`;

const nowIso = new Date().toISOString();
const posted = readJson("posted_ids.json", { ids: [] });

// Fetch ESPN scoreboard JSON
const sb = await (await fetch(SCOREBOARD)).json();
const events = Array.isArray(sb?.events) ? sb.events : [];

// Keep only finals (quality control)
const finals = events.filter(e => e?.status?.type?.completed);

const drafts = [];
for (const e of finals) {
  const c = e?.competitions?.[0]; if (!c) continue;

  const away = c.competitors?.find(x => x.homeAway === "away");
  const home = c.competitors?.find(x => x.homeAway === "home");
  if (!away || !home) continue;

  // Ranks (if present)
  const ar = away?.curatedRank?.current ?? 99;
  const hr = home?.curatedRank?.current ?? 99;
  const rankLabel = n => (n && n <= 25 ? `#${n}` : "Unranked");

  // Upset rule: unranked beats ranked OR rank gap ≥ 7 with lower rank winning
  const awayWon = Number(away?.score) > Number(home?.score);
  const upset =
    (awayWon && ((ar === 99 && hr <= 25) || (hr - ar >= 7))) ||
    (!awayWon && ((hr === 99 && ar <= 25) || (ar - hr >= 7)));

  // Safe, no-LLM fallback copy (works great by itself)
  const detail = c?.status?.type?.detail || "Final";
  const base =
    `${away.team?.displayName} ${away.score} at ${home.team?.displayName} ${home.score} — ${detail}. ` +
    `${upset ? "Upset." : ""} #CFB${upset ? " 🔥" : ""}`;

  // If you add an LLM key later, this will “polish” phrasing; otherwise uses base.
  const facts = {
    away: away.team?.displayName, ah: away.score,
    home: home.team?.displayName, hs: home.score,
    ranked: `${rankLabel(ar)} vs ${rankLabel(hr)}`,
    detail, angle: upset ? "UPSET" : "NORMAL", emoji: upset ? "🔥" : ""
  };
  const text = await phraseWithLLM("FINAL", facts, base);

  const id = `final_${e.id}`;
  if (posted.ids.includes(id)) continue; // de-dupe across runs

  drafts.push({
    id,
    kind: "final",
    priority: upset ? 90 : 60,
    text: text.slice(0, 240),               // save room for links/emojis
    link: linkOf(e, "boxscore"),
    expiresAt: expireHours(36),
    source: "espn"
  });
}

// Write outputs
writeJson("public/cfb_queue.json", { generatedAt: nowIso, posts: drafts });
writeJson("posted_ids.json", { ids: [...posted.ids, ...drafts.map(d => d.id)] });

/* ---------------- helpers ---------------- */
function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch { return fallback; }
}
function writeJson(p, obj) {
  const dir = p.split("/").slice(0, -1).join("/") || ".";
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}
function linkOf(e, rel) {
  return e.links?.find(l => Array.isArray(l.rel) && l.rel.includes(rel))?.href || "";
}
function expireHours(h) { return new Date(Date.now() + h * 3600e3).toISOString(); }
function fmtYMD(d) {
  // Format local (not UTC) YYYYMMDD to catch late-night CT games
  const dt = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return dt.toISOString().slice(0, 10).replace(/-/g, "");
}

/* -------- optional LLM phrasing (safe fallback if no key) -------- */
async function phraseWithLLM(type, facts, safeFallback) {
  const key = process.env.LLM_API_KEY;
  if (!key) return safeFallback;
  try {
    const system = "You are a cautious sports copy editor. Only rephrase the provided facts. Keep under 240 chars. No extra claims. Max one hashtag (#CFB).";
    const user = [
      `Type: ${type}`,
      `Game: ${facts.away} ${facts.ah} at ${facts.home} ${facts.hs}`,
      `Status: ${facts.detail}`,
      `Ranked: ${facts.ranked}`,
      `Angle: ${facts.angle}`,
      `Emoji: ${facts.emoji}`,
      `Task: One tweet from these facts only.`
    ].join("\n");

    const r = await fetch(process.env.LLM_ENDPOINT || "https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || "gpt-4o-mini",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0.5,
        max_tokens: 120
      })
    });
    const j = await r.json();
    const out = j?.choices?.[0]?.message?.content?.trim();
    return out && out.length <= 280 ? out : safeFallback;
  } catch {
    return safeFallback;
  }
}
