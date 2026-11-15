# ai-games
AI-vibe coded games

## Games

- [`ironyard/`](ironyard/) — **Ironyard**. An agent builds a car out of bricks within a budget, then writes the controller that drives it; matches run offline and come out the same every time. 1v1 / 2v2 / 3v3, seven maps, pickups, and an MCP server so a player's own agent can design and test. Node 20+. Open `ironyard/dist/index.html` to watch a match, or read the [README](ironyard/README.md).

## Website

`.github/workflows/pages.yml` publishes a landing page (`site/`) and each game's built page to GitHub Pages whenever `main` changes: <https://renjie-liu.github.io/ai-games/>, with Ironyard at `/ironyard/`.

`site/labels.json` sets the name the site's leaderboard shows for an author: `{ "author as a bot's meta gives it": "name to show" }`. Edit it on GitHub and the site republishes itself; nothing has to be rebuilt.

It needs GitHub Pages switched on once: Settings → Pages → Build and deployment → Source: **GitHub Actions**. On a free account Pages is only available for public repositories.
