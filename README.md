# botcfb

A College Football content generation bot that creates social media posts from ESPN data.

## Overview

This project automatically generates CFB social media content by:
- Fetching completed games from ESPN's API
- Analyzing game results for upsets, blowouts, nailbiters, etc.
- Extracting top performer statistics
- Fetching weekly poll data from CollegeFootballData (CFBD) API
- Generating poll rankings and movers posts
- Generating curated posts with appropriate hashtags
- Maintaining a web interface for content review and copying

## Architecture

### Scripts
- `scripts/generate_cfb_posts.mjs` - Generates final score posts and weekly poll posts
- Future scripts can be added for different post types (previews, halftime updates, etc.)

### Workflows
- `.github/workflows/generate-cfb.yml` - Runs the content generation script (final scores + polls)
- Additional workflows can be added for other post types

### Data Flow
1. Scripts fetch data from APIs (ESPN, CollegeFootballData, etc.)
2. Process and analyze the data
3. Generate social media posts with metadata
4. Write to `public/cfb_queue.json` with different `kind` values
5. Cache poll data in `public/poll_cache.json` for week-over-week comparisons
6. Track posted content in `posted_ids.json` to prevent duplicates
7. Web interface displays posts by category with copy functionality

## Post Types

Currently supports:
- **Final Scores** (`kind: "final"`) - Completed game results with analysis
- **Poll Top 10** (`kind: "poll_top10"`) - Weekly AP Top 10 rankings
- **Poll Movers** (`kind: "poll_movers"`) - Teams that moved 3+ spots in polls

Planned expansion:
- **Game Previews** (`kind: "preview"`) - Upcoming game analysis
- **Halftime Updates** (`kind: "halftime"`) - Live game score updates
- **Recruiting News** (`kind: "recruiting"`) - Recruiting updates
- **Transfer Portal** (`kind: "transfers"`) - Transfer news

## File Structure

```
├── index.html                 # Web interface with tabs for different post types
├── posted_ids.json           # Tracks posted content to prevent duplicates
├── public/
│   ├── cfb_queue.json        # Generated posts queue (all types)
│   └── poll_cache.json       # Cached poll data for week-over-week comparisons
├── scripts/
│   └── generate_cfb_posts.mjs # Content generation script (final scores + polls)
└── .github/workflows/
    └── generate-cfb.yml      # Workflow to run content generation
```

## Usage

### Manual Generation
Run the script locally:
```bash
node scripts/generate_cfb_posts.mjs
```

### Automated Generation
The GitHub Action workflow runs automatically and can be triggered manually from the Actions tab.

### Web Interface
Open `index.html` in a browser to view, filter, and copy generated posts. The interface includes separate tabs for "Final Scores" and "Polls" content.

## Polls Feature

The bot generates two types of poll-related posts each week:

### AP Top 10 Post
- Clean ranking of the Top 10 teams for the current week
- Includes poll name, week label, and hashtags (#APTop25 #CFB)
- Generated from real AP Top 25 data via CollegeFootballData API

### AP Movers Post  
- Highlights teams that moved up or down by 3+ spots compared to previous week
- Shows arrows (⬆️⬇️) with movement size and rank changes
- Includes new teams entering the Top 25
- Capped at 9 total teams for readability
- Format: `⬆️+7 Tennessee (22→15)` or `⬇️-4 Clemson (8→12)`

### Caching Strategy
- Poll data is cached in `public/poll_cache.json` to minimize API calls
- Stores multiple weeks of data to enable week-over-week comparisons
- Automatically detects when new poll data is available
- Falls back to cached data if API calls fail

### API Configuration
- Uses CollegeFootballData (CFBD) API for poll data
- Requires API key set as `CFBD_API_KEY` environment variable
- Fetches current week and previous week data for comparison

## Adding New Post Types

To add a new type of posts (e.g., game previews):

1. **Create new script**: `scripts/generate_preview_posts.mjs`
   - Follow the same pattern as existing script
   - Use different API endpoints and logic
   - Write to same `public/cfb_queue.json` with different `kind` value

2. **Create new workflow**: `.github/workflows/generate-preview-posts.yml`
   - Copy existing workflow structure
   - Change the script it runs
   - Set appropriate schedule

3. **Update web interface**: Add new tab to `index.html` for the new post type

## Configuration

- `LOOKBACK_DAYS`: How many days back to fetch games (default: 5)
- `BASE`: ESPN API endpoint for scoreboard data
- `CFBD_API_KEY`: CollegeFootballData API key for poll data
- `CFBD_BASE`: CollegeFootballData API endpoint
- Priority scoring: Upsets (90), Blowouts (70), Regular games (60), Polls (80-85)