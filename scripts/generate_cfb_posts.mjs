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

// --- LOAD TEAM HASHTAGS ---
const teamHashtags = readJson("public/team_hashtags.json", []);

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

  // --- TOP PERFORMERS (from scoreboard leaders) ---
  const getTopPerformer = (competitor) => {
    const teamId = competitor?.team?.id;
    if (!teamId) return null;
    
    const leaders = c?.leaders || [];
    if (!leaders.length) return null;
    
    let best = null;
    let bestScore = { tds: 0, yards: 0 };
    
    for (const leader of leaders) {
      const category = leader?.name?.toLowerCase();
      if (!category || !leader?.leaders?.[0]) continue;
      
      const player = leader.leaders[0];
      if (player?.team?.id !== teamId) continue; // Only this team's players
      
      const name = player?.athlete?.displayName || 'Unknown';
      const displayValue = player?.displayValue || '';
      
      // Parse displayValue like "13/23, 151 YDS, 1 TD"
      let tds = 0, yards = 0;
      const tdMatch = displayValue.match(/(\d+)\s+TD/);
      const yardsMatch = displayValue.match(/(\d+)\s+YDS/);
      
      if (tdMatch) tds = Number(tdMatch[1]);
      if (yardsMatch) yards = Number(yardsMatch[1]);
      
      const score = { tds, yards };
      if (score.tds > bestScore.tds || 
          (score.tds === bestScore.tds && score.yards > bestScore.yards)) {
        best = { name, category, displayValue };
        bestScore = score;
      }
    }
    
    if (!best) return null;
    
    const teamAbbr = competitor?.team?.abbreviation || 'TEAM';
    
    return `(${teamAbbr}): ${best.name} ${best.displayValue}`;
  };
  
  const awayTop = getTopPerformer(away);
  const homeTop = getTopPerformer(home);

  // --- POST TEXT ---
  const statusText = 'Final';
  const scoreLine = `${awayName} ${awayScore} @ ${homeName} ${homeScore}`;
  let base = `${scoreLine} — ${statusText}. ${hashtagParts.join(' ')}`;
  
  // Add top performers if available
  if (awayTop || homeTop) {
    const performers = [awayTop, homeTop].filter(Boolean);
    base += `\n${performers.join('\n')}`;
  }

  // Add winning team hashtag if available
  const winnerTeamName = awayWon ? awayName : homeName;
  // Strip ranking prefix (e.g., "#21 Alabama Crimson Tide" -> "Alabama Crimson Tide")
  const cleanTeamName = winnerTeamName.replace(/^#\d+\s+/, '');
  const winnerHashtag = teamHashtags.find(t => t.team === cleanTeamName)?.hashtag;
  if (winnerHashtag) {
    base += `\n\n${winnerHashtag}`;
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
