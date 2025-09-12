// scripts/cache_betting_lines.mjs
import fs from "node:fs";

const CFBD_API_KEY = "AYkI+Yu/PHFp5lbWxTjrAjN0q4DFidrdJgSoiGvPXve807qSdw0BJ6c08Vf0kFcN";
const CFBD_BASE = "https://api.collegefootballdata.com";

// Cache file path
const CACHE_FILE = "public/betting_lines_cache.json";

// Load existing cache
function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return {
      lastFetch: null,
      week3: null,
      week2: null,
      week1: null
    };
  }
}

// Save cache
function saveCache(cache) {
  fs.mkdirSync("public", { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// Fetch betting lines for a specific week
async function fetchBettingLines(year, week) {
  try {
    console.log(`Fetching betting lines for ${year} Week ${week}...`);
    const response = await fetch(`${CFBD_BASE}/lines?year=${year}&week=${week}`, {
      headers: { "Authorization": `Bearer ${CFBD_API_KEY}` }
    });
    
    if (!response.ok) {
      console.error(`API error: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data = await response.json();
    console.log(`Found ${data.length} games with betting lines for Week ${week}`);
    return data;
  } catch (error) {
    console.error(`Error fetching Week ${week} data:`, error.message);
    return null;
  }
}

// Main function
async function cacheBettingLines() {
  const cache = loadCache();
  const currentYear = 2025;
  const currentWeek = 3;
  
  console.log("Checking betting lines cache...");
  
  // Check if we already have Week 3 data
  if (cache.week3 && cache.week3.length > 0) {
    console.log(`Week 3 data already cached (${cache.week3.length} games)`);
    console.log("Using cached data - no API calls needed");
    return cache.week3;
  }
  
  console.log("Week 3 data not found in cache, fetching from API...");
  
  // Fetch Week 3 data
  const week3Data = await fetchBettingLines(currentYear, currentWeek);
  
  if (week3Data && week3Data.length > 0) {
    // Update cache
    cache.week3 = week3Data;
    cache.lastFetch = new Date().toISOString();
    saveCache(cache);
    
    console.log(`Cached ${week3Data.length} games for Week 3`);
    return week3Data;
  } else {
    console.log("No data found for Week 3");
    return null;
  }
}

// Run the caching function
cacheBettingLines().then(data => {
  if (data) {
    console.log("✅ Betting lines cache updated successfully");
  } else {
    console.log("❌ Failed to cache betting lines data");
  }
});
