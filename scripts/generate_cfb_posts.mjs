// scripts/generate_cfb_posts.mjs
import fs from "node:fs";

// --- CONFIG ---
const BASE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80";
const LOOKBACK_DAYS = 5;

// --- DATE RANGE (last 5 days) ---
const end = fmtYMD(new Date());
const start = fmtYMD(new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600e3));
const SCOREBOARD = `${BASE}&dates=${start}-${end}`;

// --- LOAD PREVIOUSLY POSTED ---
const nowIso = new Date().toISOString();
const posted = readJson("posted_ids.json", { ids: [] });

// --- FETCH ESPN DATA ---
const sb = await (await fetch(SCOREBOARD)).json();
const events = Array.isArray(sb?.events) ? sb.events : [];

// --- FILTER COMPLETED GAMES ---
const finals = events.filter(e => e?.status?.type?.completed);

// --- BUILD POSTS ---
const drafts = [];
for (const e of finals) {
  const c = e?.competitions?.[0];
  if (!c) continue;

  const away = c.competitors?.find(x => x.homeAway === "away");
  const home = c.competitors?.find(x => x.homeAway === "home");
  if (!away || !home) continue;

  // --- NAME WITH RANK ---
  const showName = (competitor) => {
    if (!competitor) return "Unknown";
    const rank = competitor?.curatedRank?.current ?? 99;
    const name = competitor?.team?.displayName ?? "Unknown";
    return rank <= 25 ? `#${rank} ${name}` : name;
  };

  const awayName = showName(away);
  const homeName = showName(home);

  const awayScore = Number(away?.score ?? 0);
  const homeScore = Number(home?.score ?? 0);

  // --- WINNER/LOSER ---
  const awayWon = awayScore > homeScore;
  const winner = awayWon
    ? { rank: away?.curatedRank?.current ?? 99, name: awayName, score: awayScore }
    : { rank: home?.curatedRank?.current ?? 99, name: homeName, score: homeScore };
  const loser = awayWon
    ? { rank: home?.curatedRank?.current ?? 99, name: homeName, score: homeScore }
    : { rank: away?.curatedRank?.current ?? 99, name: awayName, score: awayScore };

  // --- RULES ---
  let isUpset = false;
  if (winner.rank === 99 && loser.rank <= 25) {
    isUpset = true; // unranked beat ranked
  } else if (winner.rank <= 25 && loser.rank <= 25 && winner.rank - loser.rank >= 4) {
    isUpset = true; // ranked but 4+ worse
  }

  const margin = Math.abs(winner.score - loser.score);
  const isBlowout = margin >= 30;

  // --- NEW TAGS ---
  const loserScore = loser.score;
  const isShutout = loserScore === 0;
  const isNailbiter = margin <= 4;
  const isShootout = awayScore >= 35 && homeScore >= 35;
  const isRankedMatchup = (winner.rank <= 25) && (loser.rank <= 25);

  // --- HASHTAG BLOCK (fixed order) ---
  const hashtagParts = [];
  if (isUpset) hashtagParts.push('#Upset');
  if (isBlowout) hashtagParts.push('#Blowout');
  if (isShutout) hashtagParts.push('#Shutout');
  if (isNailbiter) hashtagParts.push('#Nailbiter');
  if (isShootout) hashtagParts.push('#Shootout');
  if (isRankedMatchup) hashtagParts.push('#RankedMatchup');
  hashtagParts.push('#CFB');

  // --- TOP PERFORMERS (from boxscore data) ---
  const getTopPerformer = async (competitor, isWinner) => {
    try {
      // Get boxscore URL from game links
      const boxscoreUrl = e.links?.find(l => Array.isArray(l.rel) && l.rel.includes("boxscore"))?.href;
      if (!boxscoreUrl) return null;
      
      // Fetch boxscore data
      const boxscore = await (await fetch(boxscoreUrl)).json();
      const teamId = competitor?.team?.id;
      if (!teamId) return null;
      
      // Find team's players in boxscore
      const teamPlayers = boxscore?.boxscore?.players?.find(p => p.team?.id === teamId);
      if (!teamPlayers?.statistics) return null;
      
      let best = null;
      let bestScore = { tds: 0, yards: 0, touches: 0 };
      
      // Check each stat category
      for (const statGroup of teamPlayers.statistics) {
        const category = statGroup?.name?.toLowerCase();
        if (!category || !statGroup?.athletes?.length) continue;
        
        // Get top athlete from this category
        const topAthlete = statGroup.athletes[0];
        const stats = topAthlete?.stats || [];
        const name = topAthlete?.athlete?.displayName || 'Unknown';
        
        let tds = 0, yards = 0, touches = 0;
        
        if (category === 'passing') {
          tds = Number(stats[3] || 0); // passing TDs
          yards = Number(stats[1] || 0); // passing yards  
          touches = Number(stats[0] || 0); // completions
        } else if (category === 'rushing') {
          tds = Number(stats[2] || 0); // rushing TDs
          yards = Number(stats[1] || 0); // rushing yards
          touches = Number(stats[0] || 0); // carries
        } else if (category === 'receiving') {
          tds = Number(stats[2] || 0); // receiving TDs
          yards = Number(stats[1] || 0); // receiving yards
          touches = Number(stats[0] || 0); // receptions
        }
        
        const score = { tds, yards, touches };
        if (score.tds > bestScore.tds || 
            (score.tds === bestScore.tds && score.yards > bestScore.yards) ||
            (score.tds === bestScore.tds && score.yards === bestScore.yards && score.touches > bestScore.touches)) {
          best = { name, category, stats: score };
          bestScore = score;
        }
      }
      
      if (!best) return null;
      
      const teamAbbr = competitor?.team?.abbreviation || 'TEAM';
      const pos = best.category.toUpperCase();
      const { tds, yards, touches } = best.stats;
      
      let statLine = '';
      if (best.category === 'passing') {
        const attempts = Number(stats[1] || 0); // attempts
        statLine = `${touches}/${attempts}, ${yards}y, ${tds} TD`;
      } else if (best.category === 'rushing') {
        statLine = `${touches} CAR, ${yards}y, ${tds} TD`;
      } else if (best.category === 'receiving') {
        statLine = `${touches} REC, ${yards}y, ${tds} TD`;
      }
      
      return `Top (${teamAbbr}): ${pos} ${best.name} ${statLine}`;
    } catch (err) {
      return null; // Fail silently if boxscore fetch fails
    }
  };
  
  const awayTop = await getTopPerformer(away, awayWon);
  const homeTop = await getTopPerformer(home, !awayWon);

  // --- POST TEXT ---
  const statusText = 'Final';
  const scoreLine = `${awayName} ${awayScore} @ ${homeName} ${homeScore}`;
  let base = `${scoreLine} — ${statusText}. ${hashtagParts.join(' ')}`;
  
  // Add top performers if available
  if (awayTop || homeTop) {
    const performers = [awayTop, homeTop].filter(Boolean);
    base += `\n${performers.join('\n')}`;
  }

  // --- DEDUPE ---
  const id = `final_${e.id}`;
  if (posted.ids.includes(id)) continue;

  drafts.push({
    id,
    kind: "final",
    priority: isUpset ? 90 : (isBlowout ? 70 : 60),
    text: base.slice(0, 240),
    link: e.links?.find(l => Array.isArray(l.rel) && l.rel.includes("boxscore"))?.href || "",
    expiresAt: new Date(Date.now() + 36 * 3600e3).toISOString(),
    source: "espn"
  });
}

// --- WRITE OUTPUT ---
writeJson("public/cfb_queue.json", { generatedAt: nowIso, posts: drafts });
writeJson("posted_ids.json", { ids: [...posted.ids, ...drafts.map(d => d.id)] });

// --- HELPERS ---
function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch { return fallback; }
}
function writeJson(p, obj) {
  fs.mkdirSync(p.split("/").slice(0, -1).join("/") || ".", { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}
function fmtYMD(d) {
  const dt = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return dt.toISOString().slice(0, 10).replace(/-/g, "");
}
