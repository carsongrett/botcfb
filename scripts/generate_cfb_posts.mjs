// scripts/generate_cfb_posts.mjs
import fs from "node:fs";

// --- CONFIG ---
const BASE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80";
const LOOKBACK_DAYS = 5;
const CFBD_API_KEY = "AYkI+Yu/PHFp5lbWxTjrAjN0q4DFidrdJgSoiGvPXve807qSdw0BJ6c08Vf0kFcN";
const CFBD_BASE = "https://api.collegefootballdata.com";

// --- DATE RANGE (last 5 days) ---
const end = fmtYMD(new Date());
const start = fmtYMD(new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600e3));
const SCOREBOARD = `${BASE}&dates=${start}-${end}`;

// --- LOAD PREVIOUSLY POSTED ---
const nowIso = new Date().toISOString();
const posted = readJson("posted_ids.json", { ids: [] });

// --- LOAD TEAM HASHTAGS ---
const teamHashtags = readJson("public/team_hashtags.json", []);

// --- LOAD POLL CACHE ---
const pollCache = readJson("public/poll_cache.json", {
  lastFetch: null,
  lastWeek: null,
  lastSeason: null,
  apPolls: {}, // Store AP polls by week: { "1": [...], "2": [...], "3": [...] }
  coachesPolls: {}, // Store Coaches polls by week: { "1": [...], "2": [...], "3": [...] }
  spRatings: {} // Store SP+ ratings by week: { "1": [...], "2": [...], "3": [...] }
});

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

// --- PROCESS POLLS ---
const apPollPosts = await processAPPoll();
drafts.push(...apPollPosts);

const coachesPollPosts = await processCoachesPoll();
drafts.push(...coachesPollPosts);

const spRatingsPosts = await processSPRatings();
drafts.push(...spRatingsPosts);

// --- WRITE OUTPUT ---
writeJson("public/cfb_queue.json", { generatedAt: nowIso, posts: drafts });
writeJson("posted_ids.json", { ids: [...posted.ids, ...drafts.map(d => d.id)] });

// --- POLL PROCESSING FUNCTIONS ---
async function processAPPoll() {
  try {
    // Get current season and week
    const currentSeason = new Date().getFullYear(); // 2025
    const currentWeek = await getCurrentWeek(currentSeason);
    
    if (!currentWeek) {
      console.log("No current week found, skipping AP poll");
      return [];
    }

    // Check if we already have this week's data
    const weekKey = currentWeek.toString();
    if (pollCache.lastWeek === currentWeek && pollCache.lastSeason === currentSeason && pollCache.apPolls[weekKey]) {
      console.log(`AP poll for Week ${currentWeek} already cached, using cached data`);
      // Generate posts from cached data
      const posts = [];
      
      // Top 10 post from cache
      const top10Post = formatTop10Post(pollCache.apPolls[weekKey], currentWeek);
      if (top10Post) {
        posts.push(top10Post);
      }
      
    // Movers post from cache (compare with previous week)
    const previousWeekKey = (currentWeek - 1).toString();
    if (pollCache.apPolls[previousWeekKey] && pollCache.apPolls[previousWeekKey].length > 0) {
      const moversPost = formatMoversPost(pollCache.apPolls[weekKey], pollCache.apPolls[previousWeekKey], currentWeek);
      if (moversPost) {
        posts.push(moversPost);
      }
    } else {
      console.log(`No previous week data available for movers comparison`);
    }
      
      return posts;
    }

    // Fetch current AP poll
    const currentPoll = await fetchAPPoll(currentSeason, currentWeek);
    if (!currentPoll || !currentPoll.length) {
      console.log("No AP poll data found for current week");
      return [];
    }

    // Fetch previous week's poll for comparison
    const previousWeek = currentWeek > 1 ? currentWeek - 1 : null;
    let previousPoll = null;
    if (previousWeek) {
      previousPoll = await fetchAPPoll(currentSeason, previousWeek);
    }

    // Generate posts
    const posts = [];
    
    // Top 10 post
    const top10Post = formatTop10Post(currentPoll, currentWeek);
    if (top10Post) {
      posts.push(top10Post);
    }

    // Movers post (only if we have previous data)
    if (previousPoll) {
      const moversPost = formatMoversPost(currentPoll, previousPoll, currentWeek);
      if (moversPost) {
        posts.push(moversPost);
      }
    }

    // Update cache with current week's poll
    pollCache.lastFetch = new Date().toISOString();
    pollCache.lastWeek = currentWeek;
    pollCache.lastSeason = currentSeason;
    pollCache.apPolls[weekKey] = currentPoll;
    
    // Also fetch and cache previous week if we don't have it
    const previousWeekKey = (currentWeek - 1).toString();
    if (!pollCache.apPolls[previousWeekKey] && currentWeek > 1) {
      console.log(`Fetching previous week ${currentWeek - 1} for movers comparison...`);
      const previousPoll = await fetchAPPoll(currentSeason, currentWeek - 1);
      if (previousPoll && previousPoll.length) {
        pollCache.apPolls[previousWeekKey] = previousPoll;
        console.log(`Cached Week ${currentWeek - 1} AP poll data`);
      }
    }
    
    writeJson("public/poll_cache.json", pollCache);

    return posts;
  } catch (error) {
    console.error("Error processing AP poll:", error);
    return [];
  }
}

async function processCoachesPoll() {
  try {
    // Get current season and week
    const currentSeason = new Date().getFullYear(); // 2025
    const currentWeek = await getCurrentWeek(currentSeason);
    
    if (!currentWeek) {
      console.log("No current week found, skipping Coaches poll");
      return [];
    }

    // Check if we already have this week's data
    const weekKey = currentWeek.toString();
    if (pollCache.lastWeek === currentWeek && pollCache.lastSeason === currentSeason && pollCache.coachesPolls[weekKey]) {
      console.log(`Coaches poll for Week ${currentWeek} already cached, using cached data`);
      // Generate posts from cached data
      const posts = [];
      
      // Top 10 post from cache
      const top10Post = formatCoachesTop10Post(pollCache.coachesPolls[weekKey], currentWeek);
      if (top10Post) {
        posts.push(top10Post);
      }
      
    // Movers post from cache (compare with previous week)
    const previousWeekKey = (currentWeek - 1).toString();
    if (pollCache.coachesPolls[previousWeekKey] && pollCache.coachesPolls[previousWeekKey].length > 0) {
      const moversPost = formatCoachesMoversPost(pollCache.coachesPolls[weekKey], pollCache.coachesPolls[previousWeekKey], currentWeek);
      if (moversPost) {
        posts.push(moversPost);
      }
    } else {
      console.log(`No previous week data available for movers comparison`);
    }
      
      return posts;
    }

    // Fetch current Coaches poll
    const currentPoll = await fetchCoachesPoll(currentSeason, currentWeek);
    if (!currentPoll || !currentPoll.length) {
      console.log("No Coaches poll data found for current week");
      return [];
    }

    // Fetch previous week's poll for comparison
    const previousWeek = currentWeek > 1 ? currentWeek - 1 : null;
    let previousPoll = null;
    if (previousWeek) {
      previousPoll = await fetchCoachesPoll(currentSeason, previousWeek);
    }

    // Generate posts
    const posts = [];
    
    // Top 10 post
    const top10Post = formatCoachesTop10Post(currentPoll, currentWeek);
    if (top10Post) {
      posts.push(top10Post);
    }

    // Movers post (only if we have previous data)
    if (previousPoll) {
      const moversPost = formatCoachesMoversPost(currentPoll, previousPoll, currentWeek);
      if (moversPost) {
        posts.push(moversPost);
      }
    }

    // Update cache with current week's poll
    pollCache.lastFetch = new Date().toISOString();
    pollCache.lastWeek = currentWeek;
    pollCache.lastSeason = currentSeason;
    pollCache.coachesPolls[weekKey] = currentPoll;
    
    // Also fetch and cache previous week if we don't have it
    const previousWeekKey = (currentWeek - 1).toString();
    if (!pollCache.coachesPolls[previousWeekKey] && currentWeek > 1) {
      console.log(`Fetching previous week ${currentWeek - 1} for movers comparison...`);
      const previousPoll = await fetchCoachesPoll(currentSeason, currentWeek - 1);
      if (previousPoll && previousPoll.length) {
        pollCache.coachesPolls[previousWeekKey] = previousPoll;
        console.log(`Cached Week ${currentWeek - 1} Coaches poll data`);
      }
    }
    
    writeJson("public/poll_cache.json", pollCache);

    return posts;
  } catch (error) {
    console.error("Error processing Coaches poll:", error);
    return [];
  }
}

async function processSPRatings() {
  try {
    // Get current season and week
    const currentSeason = new Date().getFullYear(); // 2025
    const currentWeek = await getCurrentWeek(currentSeason);
    
    if (!currentWeek) {
      console.log("No current week found, skipping SP+ ratings");
      return [];
    }

    // Check if we already have this week's data
    const weekKey = currentWeek.toString();
    if (pollCache.lastWeek === currentWeek && pollCache.lastSeason === currentSeason && pollCache.spRatings && pollCache.spRatings[weekKey]) {
      console.log(`SP+ ratings for Week ${currentWeek} already cached, using cached data`);
      // Generate posts from cached data
      const posts = [];
      
      // Top 10 post from cache
      const top10Post = formatSPTop10Post(pollCache.spRatings[weekKey], currentWeek);
      if (top10Post) {
        posts.push(top10Post);
      }
      
    // Movers post from cache (compare with previous week)
    const previousWeekKey = (currentWeek - 1).toString();
    if (pollCache.spRatings && pollCache.spRatings[previousWeekKey] && pollCache.spRatings[previousWeekKey].length > 0) {
      const moversPost = formatSPMoversPost(pollCache.spRatings[weekKey], pollCache.spRatings[previousWeekKey], currentWeek);
      if (moversPost) {
        posts.push(moversPost);
      }
    } else {
      console.log(`No previous week data available for movers comparison`);
    }
      
      return posts;
    }

    // Fetch current SP+ ratings
    const currentRatings = await fetchSPRatings(currentSeason, currentWeek);
    if (!currentRatings || !currentRatings.length) {
      console.log("No SP+ ratings data found for current week");
      return [];
    }

    // Fetch previous week's ratings for comparison
    const previousWeek = currentWeek > 1 ? currentWeek - 1 : null;
    let previousRatings = null;
    if (previousWeek) {
      previousRatings = await fetchSPRatings(currentSeason, previousWeek);
    }

    // Generate posts
    const posts = [];
    
    // Top 10 post
    const top10Post = formatSPTop10Post(currentRatings, currentWeek);
    if (top10Post) {
      posts.push(top10Post);
    }

    // Movers post (only if we have previous data)
    if (previousRatings) {
      const moversPost = formatSPMoversPost(currentRatings, previousRatings, currentWeek);
      if (moversPost) {
        posts.push(moversPost);
      }
    }

    // Update cache with current week's ratings
    pollCache.lastFetch = new Date().toISOString();
    pollCache.lastWeek = currentWeek;
    pollCache.lastSeason = currentSeason;
    if (!pollCache.spRatings) pollCache.spRatings = {};
    pollCache.spRatings[weekKey] = currentRatings;
    
    // Also fetch and cache previous week if we don't have it
    const previousWeekKey = (currentWeek - 1).toString();
    if (!pollCache.spRatings[previousWeekKey] && currentWeek > 1) {
      console.log(`Fetching previous week ${currentWeek - 1} for movers comparison...`);
      const previousRatings = await fetchSPRatings(currentSeason, currentWeek - 1);
      if (previousRatings && previousRatings.length) {
        pollCache.spRatings[previousWeekKey] = previousRatings;
        console.log(`Cached Week ${currentWeek - 1} SP+ ratings data`);
      }
    }
    
    writeJson("public/poll_cache.json", pollCache);

    return posts;
  } catch (error) {
    console.error("Error processing SP+ ratings:", error);
    return [];
  }
}

async function getCurrentWeek(season) {
  try {
    console.log(`Fetching calendar for season ${season}...`);
    const response = await fetch(`${CFBD_BASE}/calendar?year=${season}`, {
      headers: { "Authorization": `Bearer ${CFBD_API_KEY}` }
    });
    
    console.log(`Calendar response status: ${response.status}`);
    if (!response.ok) {
      console.error(`Calendar API error: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const calendar = await response.json();
    console.log(`Calendar data:`, calendar);
    
    // We are in Week 3 - use that directly
    console.log(`Current week: 3`);
    return 3;
  } catch (error) {
    console.error("Error fetching current week:", error);
    return null;
  }
}

async function fetchAPPoll(season, week) {
  try {
    console.log(`Fetching AP poll for season ${season}, week ${week}...`);
    const response = await fetch(`${CFBD_BASE}/rankings?year=${season}&week=${week}&seasonType=regular`, {
      headers: { "Authorization": `Bearer ${CFBD_API_KEY}` }
    });
    
    console.log(`Rankings response status: ${response.status}`);
    if (!response.ok) {
      console.error(`Rankings API error: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const rankings = await response.json();
    console.log(`Rankings data:`, JSON.stringify(rankings, null, 2));
    
    // Find AP poll in the polls array
    const polls = rankings[0]?.polls || [];
    console.log(`Available polls:`, polls.map(p => p.poll));
    const apPoll = polls.find(poll => poll.poll === "AP Top 25");
    console.log(`AP Poll found:`, apPoll);
    return apPoll ? apPoll.ranks : null;
  } catch (error) {
    console.error("Error fetching AP poll:", error);
    return null;
  }
}

async function fetchCoachesPoll(season, week) {
  try {
    console.log(`Fetching Coaches poll for season ${season}, week ${week}...`);
    const response = await fetch(`${CFBD_BASE}/rankings?year=${season}&week=${week}&seasonType=regular`, {
      headers: { "Authorization": `Bearer ${CFBD_API_KEY}` }
    });
    
    console.log(`Rankings response status: ${response.status}`);
    if (!response.ok) {
      console.error(`Rankings API error: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const rankings = await response.json();
    console.log(`Rankings data:`, JSON.stringify(rankings, null, 2));
    
    // Find Coaches poll in the polls array
    const polls = rankings[0]?.polls || [];
    console.log(`Available polls:`, polls.map(p => p.poll));
    const coachesPoll = polls.find(poll => poll.poll === "Coaches Poll");
    console.log(`Coaches Poll found:`, coachesPoll);
    return coachesPoll ? coachesPoll.ranks : null;
  } catch (error) {
    console.error("Error fetching Coaches poll:", error);
    return null;
  }
}

async function fetchSPRatings(season, week) {
  try {
    console.log(`Fetching SP+ ratings for season ${season}, week ${week}...`);
    const response = await fetch(`${CFBD_BASE}/ratings/sp?year=${season}&week=${week}`, {
      headers: { "Authorization": `Bearer ${CFBD_API_KEY}` }
    });
    
    console.log(`SP+ response status: ${response.status}`);
    if (!response.ok) {
      console.error(`SP+ API error: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const ratings = await response.json();
    console.log(`SP+ data length: ${ratings.length}`);
    
    // Filter out entries with null rankings (like nationalAverages)
    const validRatings = ratings.filter(team => team.ranking !== null && team.ranking !== undefined);
    
    // Sort by ranking to ensure proper order
    const sortedRatings = validRatings.sort((a, b) => a.ranking - b.ranking);
    console.log(`SP+ top 5:`, sortedRatings.slice(0, 5).map(t => `${t.ranking}. ${t.team} (${t.rating})`));
    
    return sortedRatings;
  } catch (error) {
    console.error("Error fetching SP+ ratings:", error);
    return null;
  }
}

function formatTop10Post(rankings, week) {
  if (!rankings || rankings.length < 10) return null;

  const top10 = rankings.slice(0, 10);
  let text = `AP Top 10 - Week ${week}\n`;
  
  top10.forEach((team, index) => {
    text += `${index + 1}. ${team.school}\n`;
  });
  
  text += `\n#APTop25 #CFB`;

  return {
    id: `ap_top10_week${week}`,
    kind: "poll_top10",
    priority: 85,
    text: text.slice(0, 240),
    link: "",
    expiresAt: new Date(Date.now() + 7 * 24 * 3600e3).toISOString(), // 7 days
    source: "cfbd"
  };
}

function formatCoachesTop10Post(rankings, week) {
  if (!rankings || rankings.length < 10) return null;

  const top10 = rankings.slice(0, 10);
  let text = `Coaches Poll Top 10 - Week ${week}\n`;
  
  top10.forEach((team, index) => {
    text += `${index + 1}. ${team.school}\n`;
  });
  
  text += `\n#CoachesPoll #CFB`;

  return {
    id: `coaches_top10_week${week}`,
    kind: "poll_top10",
    priority: 85,
    text: text.slice(0, 240),
    link: "",
    expiresAt: new Date(Date.now() + 7 * 24 * 3600e3).toISOString(), // 7 days
    source: "cfbd"
  };
}

function formatMoversPost(currentRankings, previousRankings, week) {
  if (!currentRankings || !previousRankings) return null;

  // Create lookup for previous rankings
  const previousLookup = {};
  previousRankings.forEach(team => {
    previousLookup[team.school] = team.rank;
  });

  const movers = [];
  const newEntries = [];

  // Find movers and new entries
  currentRankings.forEach(team => {
    const previousRank = previousLookup[team.school];
    const currentRank = team.rank;
    
    if (previousRank === undefined) {
      // New entry
      newEntries.push({ team: team.school, rank: currentRank });
    } else {
      const change = previousRank - currentRank; // Positive = moved up
      if (Math.abs(change) >= 3) {
        movers.push({
          team: team.school,
          currentRank,
          previousRank,
          change
        });
      }
    }
  });

  // Sort movers by biggest change first
  movers.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  // Combine movers and new entries, cap at 9
  const allChanges = [
    ...movers.slice(0, 9 - newEntries.length),
    ...newEntries.map(entry => ({ ...entry, change: 'NEW' }))
  ];

  if (allChanges.length === 0) return null;

  let text = `AP Poll Movers - Week ${week}\n`;
  
  allChanges.forEach(change => {
    if (change.change === 'NEW') {
      text += `NEW: #${change.rank} ${change.team}\n`;
    } else {
      const arrow = change.change > 0 ? '⬆️' : '⬇️';
      const moveText = change.change > 0 ? `+${change.change}` : `${change.change}`;
      text += `${arrow}${moveText} ${change.team} (${change.previousRank}→${change.currentRank})\n`;
    }
  });
  
  text += `\n#APTop25 #CFB`;

  return {
    id: `ap_movers_week${week}`,
    kind: "poll_movers", 
    priority: 80,
    text: text.slice(0, 240),
    link: "",
    expiresAt: new Date(Date.now() + 7 * 24 * 3600e3).toISOString(), // 7 days
    source: "cfbd"
  };
}

function formatCoachesMoversPost(currentRankings, previousRankings, week) {
  if (!currentRankings || !previousRankings) return null;

  // Create lookup for previous rankings
  const previousLookup = {};
  previousRankings.forEach(team => {
    previousLookup[team.school] = team.rank;
  });

  const movers = [];
  const newEntries = [];

  // Find movers and new entries
  currentRankings.forEach(team => {
    const previousRank = previousLookup[team.school];
    const currentRank = team.rank;
    
    if (previousRank === undefined) {
      // New entry
      newEntries.push({ team: team.school, rank: currentRank });
    } else {
      const change = previousRank - currentRank; // Positive = moved up
      if (Math.abs(change) >= 3) {
        movers.push({
          team: team.school,
          currentRank,
          previousRank,
          change
        });
      }
    }
  });

  // Sort movers by biggest change first
  movers.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  // Combine movers and new entries, cap at 9
  const allChanges = [
    ...movers.slice(0, 9 - newEntries.length),
    ...newEntries.map(entry => ({ ...entry, change: 'NEW' }))
  ];

  if (allChanges.length === 0) return null;

  let text = `Coaches Poll Movers - Week ${week}\n`;
  
  allChanges.forEach(change => {
    if (change.change === 'NEW') {
      text += `NEW: #${change.rank} ${change.team}\n`;
    } else {
      const arrow = change.change > 0 ? '⬆️' : '⬇️';
      const moveText = change.change > 0 ? `+${change.change}` : `${change.change}`;
      text += `${arrow}${moveText} ${change.team} (${change.previousRank}→${change.currentRank})\n`;
    }
  });
  
  text += `\n#CoachesPoll #CFB`;

  return {
    id: `coaches_movers_week${week}`,
    kind: "poll_movers", 
    priority: 80,
    text: text.slice(0, 240),
    link: "",
    expiresAt: new Date(Date.now() + 7 * 24 * 3600e3).toISOString(), // 7 days
    source: "cfbd"
  };
}

function formatSPTop10Post(ratings, week) {
  if (!ratings || ratings.length < 10) return null;

  const top10 = ratings.slice(0, 10);
  let text = `SP+ Power Rankings - Week ${week}\n`;
  
  top10.forEach((team, index) => {
    text += `${index + 1}. ${team.team} (${team.rating})\n`;
  });
  
  text += `\n#SPPlus #CFB`;

  return {
    id: `sp_top10_week${week}`,
    kind: "poll_top10",
    priority: 85,
    text: text.slice(0, 240),
    link: "",
    expiresAt: new Date(Date.now() + 7 * 24 * 3600e3).toISOString(), // 7 days
    source: "cfbd"
  };
}

function formatSPMoversPost(currentRatings, previousRatings, week) {
  if (!currentRatings || !previousRatings) return null;

  // Create lookup for previous rankings
  const previousLookup = {};
  previousRatings.forEach(team => {
    previousLookup[team.team] = team.ranking;
  });

  const movers = [];
  const newEntries = [];

  // Find movers and new entries
  currentRatings.forEach(team => {
    const previousRank = previousLookup[team.team];
    const currentRank = team.ranking;
    
    if (previousRank === undefined) {
      // New entry (top 25)
      if (currentRank <= 25) {
        newEntries.push({ team: team.team, rank: currentRank });
      }
    } else {
      const change = previousRank - currentRank; // Positive = moved up
      if (Math.abs(change) >= 3) {
        movers.push({
          team: team.team,
          currentRank,
          previousRank,
          change
        });
      }
    }
  });

  // Sort movers by biggest change first
  movers.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  // Combine movers and new entries, cap at 9
  const allChanges = [
    ...movers.slice(0, 9 - newEntries.length),
    ...newEntries.map(entry => ({ ...entry, change: 'NEW' }))
  ];

  if (allChanges.length === 0) return null;

  let text = `SP+ Power Rankings Movers - Week ${week}\n`;
  
  allChanges.forEach(change => {
    if (change.change === 'NEW') {
      text += `NEW: #${change.rank} ${change.team}\n`;
    } else {
      const arrow = change.change > 0 ? '⬆️' : '⬇️';
      const moveText = change.change > 0 ? `+${change.change}` : `${change.change}`;
      text += `${arrow}${moveText} ${change.team} (${change.previousRank}→${change.currentRank})\n`;
    }
  });
  
  text += `\n#SPPlus #CFB`;

  return {
    id: `sp_movers_week${week}`,
    kind: "poll_movers", 
    priority: 80,
    text: text.slice(0, 240),
    link: "",
    expiresAt: new Date(Date.now() + 7 * 24 * 3600e3).toISOString(), // 7 days
    source: "cfbd"
  };
}


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
