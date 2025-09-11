# botcfb

A College Football content generation bot that creates social media posts from ESPN data.

## Overview

This project automatically generates CFB social media content by:
- Fetching completed games from ESPN's API
- Analyzing game results for upsets, blowouts, nailbiters, etc.
- Extracting top performer statistics
- Generating curated posts with appropriate hashtags
- Maintaining a web interface for content review and copying

## Architecture

### Scripts
- `scripts/generate_cfb_posts.mjs` - Generates final score posts from completed games
- Future scripts can be added for different post types (previews, halftime updates, etc.)

### Workflows
- `.github/workflows/generate-cfb.yml` - Runs the final score generation script
- Additional workflows can be added for other post types

### Data Flow
1. Scripts fetch data from APIs (ESPN, etc.)
2. Process and analyze the data
3. Generate social media posts with metadata
4. Write to `public/cfb_queue.json` with different `kind` values
5. Track posted content in `posted_ids.json` to prevent duplicates
6. Web interface displays posts by category with copy functionality

## Post Types

Currently supports:
- **Final Scores** (`kind: "final"`) - Completed game results with analysis

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
│   └── cfb_queue.json        # Generated posts queue (all types)
├── scripts/
│   └── generate_cfb_posts.mjs # Final score generation script
└── .github/workflows/
    └── generate-cfb.yml      # Workflow to run final score generation
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
Open `index.html` in a browser to view, filter, and copy generated posts.

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
- Priority scoring: Upsets (90), Blowouts (70), Regular games (60)