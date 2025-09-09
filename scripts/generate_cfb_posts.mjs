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

    // --- RANK + NAME HELPER ---
  const showName = (competitor) => {
    const rank = competitor?.curatedRank?.current ?? 99;
    return rank <= 25
      ? `#${rank} ${competitor.team?.displayName}`
      : competitor.team?.displayName;
  };

  const awayName = showName(away);
  const homeName = showName(home);

  const awayScore = Number(away?.score);
  const homeScore = Number(home?.score);

  // --- WHO WON ---
  const awayWon = awayScore > homeScore;
  const winner = awayWon ? { obj: away, name: awayName, score: awayScore } : { obj: home, name: homeName, score: homeScore };
  const loser  = awayWon ? { obj: home, name: homeName, score: homeScore } : { obj: away, name: awayName, score: awayScore };

  const winnerRank = winner.obj?.curatedRank?.current ?? 99;
  const loserRank  = loser.obj?.curatedRank?.current ?? 99;

  // --- UPSET CHECK ---
  let isUpset = false;
  if (winnerRank === 99 && loserRank <= 25) {
    // Unranked beat ranked
    isUpset = true;
  } else if (winnerRank <= 25 && loserRank <= 25 && winnerRank - loserRank >= 4) {
    // Both ranked, gap of 4+
    isUpset = true;
  }

  // --- BLOWOUT CHECK ---
  const margin = Math.abs(winner.score - loser.score);
  const isBlowout = margin >= 30;

  // --- TAGS ---
  let tags = [];
  if (isUpset) tags.push("Upset");
  if (isBlowout) tags.push("Blowout");

  const detail = c?.status?.type?.detail || "Final";

  const base = `${awayName} ${awayScore} at ${homeName} ${homeScore} — ${detail}. ${tags.join(" ")} #CFB`;



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

function readJson(p, f) { try { return JSON.parse(fs.readFileSync(p,"utf8")); } catch { return f; } }
function writeJson(p, o) { fs.mkdirSync(p.split("/").slice(0,-1).join("/")||".",{recursive:true}); fs.writeFileSync(p, JSON.stringify(o,null,2)); }
function fmtYMD(d){ const dt=new Date(d.getTime()-d.getTimezoneOffset()*60000); return dt.toISOString().slice(0,10).replace(/-/g,""); }
