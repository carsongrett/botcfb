// scripts/generate_cfb_posts.mjs
import fs from "node:fs";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80";
const LOOKBACK_DAYS = 2;
const end = fmtYMD(new Date());
const start = fmtYMD(new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600e3));
const SCOREBOARD = `${BASE}&dates=${start}-${end}`;

const nowIso = new Date().toISOString();
const posted = readJson("posted_ids.json", { ids: [] });

const sb = await (await fetch(SCOREBOARD)).json();
const events = Array.isArray(sb?.events) ? sb.events : [];
const finals = events.filter(e => e?.status?.type?.completed);

const drafts = [];
for (const e of finals) {
  const c = e?.competitions?.[0]; if (!c) continue;
  const away = c.competitors?.find(x => x.homeAway === "away");
  const home = c.competitors?.find(x => x.homeAway === "home");
  if (!away || !home) continue;

  const ar = away?.curatedRank?.current ?? 99;
  const hr = home?.curatedRank?.current ?? 99;
  const rankLabel = n => (n && n <= 25 ? `#${n}` : "Unranked");

  const awayWon = Number(away?.score) > Number(home?.score);
  const upset =
    (awayWon && ((ar === 99 && hr <= 25) || (hr - ar >= 7))) ||
    (!awayWon && ((hr === 99 && ar <= 25) || (ar - hr >= 7)));

  const detail = c?.status?.type?.detail || "Final";
  const base =
    `${away.team?.displayName} ${away.score} at ${home.team?.displayName} ${home.score} — ${detail}. ` +
    `${upset ? "Upset." : ""} #CFB${upset ? " 🔥" : ""}`;

  const id = `final_${e.id}`;
  if (posted.ids.includes(id)) continue;

  drafts.push({
    id,
    kind: "final",
    priority: upset ? 90 : 60,
    text: base.slice(0, 240),
    link: e.links?.find(l => Array.isArray(l.rel) && l.rel.includes("boxscore"))?.href || "",
    expiresAt: new Date(Date.now() + 36 * 3600e3).toISOString(),
    source: "espn"
  });
}

writeJson("public/cfb_queue.json", { generatedAt: nowIso, posts: drafts });
writeJson("posted_ids.json", { ids: [...posted.ids, ...drafts.map(d => d.id)] });

function readJson(p, fallback) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; } }
function writeJson(p, obj) { fs.mkdirSync(p.split("/").slice(0, -1).join("/") || ".", { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj, null, 2)); }
function fmtYMD(d){ const dt=new Date(d.getTime()-d.getTimezoneOffset()*60000); return dt.toISOString().slice(0,10).replace(/-/g,""); }
