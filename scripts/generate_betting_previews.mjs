// scripts/generate_betting_previews.mjs
import fs from "node:fs";

// --- CONFIG ---
const CACHE_FILE = "public/betting_lines_cache.json";
const TEAM_HASHTAGS_FILE = "public/team_hashtags.json";
const QUEUE_FILE = "public/cfb_queue.json";
const POSTED_IDS_FILE = "posted_ids.json";

// --- LOAD DATA ---
const cache = loadJson(CACHE_FILE, { week3: [] });
const teamHashtags = loadJson(TEAM_HASHTAGS_FILE, []);
const posted = loadJson(POSTED_IDS_FILE, { ids: [] });

console.log("Generating betting previews for Week 3...");

// --- PROCESS GAMES ---
const games = cache.week3 || [];
const conferenceGames = games.filter(game => 
  game.homeConference && 
  game.awayConference && 
  game.homeConference === game.awayConference &&
  game.homeClassification === "fbs" &&
  game.awayClassification === "fbs"
);

console.log(`Found ${conferenceGames.length} conference games`);

const posts = [];
for (const game of conferenceGames) {
  const post = createBettingPreviewPost(game);
  if (post) {
    posts.push(post);
  }
}

console.log(`Generated ${posts.length} betting preview posts`);

// --- WRITE OUTPUT ---
if (posts.length > 0) {
  const existingQueue = loadJson(QUEUE_FILE, { posts: [] });
  const updatedQueue = {
    ...existingQueue,
    generatedAt: new Date().toISOString(),
    posts: [...existingQueue.posts, ...posts]
  };
  
  writeJson(QUEUE_FILE, updatedQueue);
  
  const newPostedIds = posts.map(p => p.id);
  writeJson(POSTED_IDS_FILE, { ids: [...posted.ids, ...newPostedIds] });
  
  console.log(`Added ${posts.length} posts to queue`);
} else {
  console.log("No betting preview posts generated");
}

// --- FUNCTIONS ---

function createBettingPreviewPost(game) {
  // Get odds from DraftKings or ESPN Bet
  const odds = getOdds(game);
  if (!odds) {
    console.log(`No valid odds for ${game.awayTeam} @ ${game.homeTeam}`);
    return null;
  }
  
  // Get team info
  const awayInfo = getTeamInfo(game.awayTeam);
  const homeInfo = getTeamInfo(game.homeTeam);
  
  if (!awayInfo || !homeInfo) {
    console.log(`Missing team info for ${game.awayTeam} or ${game.homeTeam}`);
    return null;
  }
  
  // Determine favorite and underdog
  const isHomeFavorite = odds.spread < 0;
  const favorite = isHomeFavorite ? homeInfo : awayInfo;
  const underdog = isHomeFavorite ? awayInfo : homeInfo;
  
  // Format spread
  const spreadText = isHomeFavorite ? 
    `${homeInfo.name} (${odds.spread})` : 
    `${awayInfo.name} (+${Math.abs(odds.spread)})`;
  
  // Format moneyline for underdog
  const underdogMoneyline = isHomeFavorite ? odds.awayMoneyline : odds.homeMoneyline;
  const moneylineText = `+${underdogMoneyline}`;
  
  // Format teams
  const awayTeamText = isHomeFavorite ? 
    `${awayInfo.name} (${moneylineText})` : 
    awayInfo.name;
  const homeTeamText = isHomeFavorite ? 
    homeInfo.name : 
    `${homeInfo.name} (${moneylineText})`;
  
  // Format time
  const gameTime = formatGameTime(game.startDate);
  
  // Create post text
  const text = `Week 3 Preview\n${awayTeamText} @ ${homeTeamText}. O/U: ${odds.overUnder}\n${gameTime}\n#${awayInfo.hashtag.replace('#', '')} #${homeInfo.hashtag.replace('#', '')}`;
  
  // Check if already posted
  const id = `betting_preview_${game.id}`;
  if (posted.ids.includes(id)) {
    console.log(`Betting preview for game ${game.id} already posted`);
    return null;
  }
  
  return {
    id,
    kind: "betting_preview",
    priority: 90,
    text: text.slice(0, 280),
    link: `https://www.espn.com/college-football/game/_/gameId/${game.id}`,
    expiresAt: new Date(Date.now() + 24 * 3600e3).toISOString(), // 24 hours
    source: "cfbd"
  };
}

function getOdds(game) {
  if (!game.lines || game.lines.length === 0) {
    return null;
  }
  
  // Try DraftKings first
  let odds = game.lines.find(line => line.provider === "DraftKings");
  
  // Fallback to ESPN Bet
  if (!odds) {
    odds = game.lines.find(line => line.provider === "ESPN Bet");
  }
  
  if (!odds || !odds.spread || !odds.overUnder) {
    return null;
  }
  
  return {
    spread: odds.spread,
    overUnder: odds.overUnder,
    homeMoneyline: odds.homeMoneyline,
    awayMoneyline: odds.awayMoneyline
  };
}

function getTeamInfo(teamName) {
  // Try exact match first
  let team = teamHashtags.find(t => t.team === teamName);
  
  // Try partial matches
  if (!team) {
    team = teamHashtags.find(t => 
      t.team.toLowerCase().includes(teamName.toLowerCase()) ||
      teamName.toLowerCase().includes(t.team.toLowerCase())
    );
  }
  
  if (!team) {
    return null;
  }
  
  return {
    name: team.team,
    hashtag: team.hashtag
  };
}

function formatGameTime(startDate) {
  try {
    const date = new Date(startDate);
    const centralTime = new Date(date.getTime() - (6 * 60 * 60 * 1000)); // Convert to CT
    
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = days[centralTime.getDay()];
    
    let hours = centralTime.getHours();
    const minutes = centralTime.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 should be 12
    
    const timeStr = minutes < 10 ? `${hours}:0${minutes}` : `${hours}:${minutes}`;
    
    return `${dayOfWeek} at ${timeStr} ${ampm} CT`;
  } catch (error) {
    console.error(`Error formatting time for ${startDate}:`, error);
    return "Time TBD";
  }
}

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, obj) {
  fs.mkdirSync(file.split("/").slice(0, -1).join("/") || ".", { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}
