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
- **Poll Top 10** (`kind: "poll_top10"`) - Weekly AP Top 10, Coaches Poll Top 10, and SP+ Power Rankings
- **Poll Movers** (`kind: "poll_movers"`) - Teams that moved 3+ spots in polls/rankings

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
│   ├── poll_cache.json       # Cached poll data for week-over-week comparisons
│   └── team_hashtags.json    # Team hashtag mappings for social media posts
├── scripts/
│   └── generate_cfb_posts.mjs # Content generation script (final scores + polls)
└── .github/workflows/
    └── generate-cfb.yml      # Workflow to run content generation
```

## Installation & Setup

### Prerequisites
- Node.js 20 or higher
- Git (for GitHub Actions)

### Environment Variables
Set the following environment variable:
- `CFBD_API_KEY`: Your CollegeFootballData API key (get one at [collegefootballdata.com](https://collegefootballdata.com))

### Local Setup
1. Clone the repository
2. Install dependencies (if any are added in the future)
3. Set your `CFBD_API_KEY` environment variable
4. Run the generation script

## Usage

### Manual Generation
Run the script locally:
```bash
node scripts/generate_cfb_posts.mjs
```

### Automated Generation
The GitHub Action workflow can be triggered manually from the Actions tab. It includes an optional input to reset `posted_ids.json` for re-testing the same games.

### Web Interface
Open `index.html` in a browser to view, filter, and copy generated posts. The interface includes separate tabs for "Final Scores" and "Polls" content.

## Polls Feature

The bot generates two types of poll-related posts each week for multiple ranking systems:

### AP Poll Posts
- **AP Top 10**: Clean ranking of the Top 10 teams with hashtags (#APTop25 #CFB)
- **AP Movers**: Teams that moved 3+ spots, shows arrows and rank changes

### Coaches Poll Posts  
- **Coaches Top 10**: Top 10 teams from Coaches Poll with hashtags (#CoachesPoll #CFB)
- **Coaches Movers**: Teams that moved 3+ spots in Coaches Poll

### SP+ Power Rankings Posts
- **SP+ Top 10**: Top 10 teams with SP+ ratings (e.g., "1. Oregon (26.7)") and hashtags (#SPPlus #CFB)
- **SP+ Movers**: Teams that moved 3+ spots in SP+ rankings

### Movers Post Format
- Highlights teams that moved up or down by 3+ spots compared to previous week
- Shows arrows (⬆️⬇️) with movement size and rank changes
- Includes new teams entering the Top 25
- Capped at 9 total teams for readability
- Format: `⬆️+7 Tennessee (22→15)` or `⬇️-4 Clemson (8→12)`

### Caching Strategy
- Poll data is cached in `public/poll_cache.json` to minimize API calls
- Stores multiple weeks of data for each ranking system (AP, Coaches, SP+)
- Structure: `{ apPolls: {}, coachesPolls: {}, spRatings: {} }`
- Automatically detects when new poll data is available
- Falls back to cached data if API calls fail

### API Configuration
- Uses CollegeFootballData (CFBD) API for all poll/ranking data
- Requires API key set as `CFBD_API_KEY` environment variable
- Fetches current week and previous week data for comparison
- Handles different data structures for polls vs. ratings (SP+)

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

### Environment Variables
- `CFBD_API_KEY`: CollegeFootballData API key for poll/ranking data (required)

### Script Configuration
- `LOOKBACK_DAYS`: How many days back to fetch games (default: 5)
- `BASE`: ESPN API endpoint for scoreboard data
- `CFBD_BASE`: CollegeFootballData API endpoint
- Priority scoring: Upsets (90), Blowouts (70), Regular games (60), Polls (80-85)

## Available Polls/Rankings

The bot currently supports:
- **AP Top 25** - Traditional media poll
- **Coaches Poll** - Coaches' rankings
- **SP+ Ratings** - Bill Connelly's advanced metric (power rankings)

Future additions could include:
- **FPI Rankings** - ESPN's Football Power Index
- **CFP Rankings** - College Football Playoff committee rankings
- **Other advanced metrics** - Various analytical ranking systems