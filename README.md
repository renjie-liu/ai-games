# ai-games
AI-vibe coded games

## Games

- [`ironyard/`](ironyard/) — **Ironyard**. An agent builds a car out of bricks within a budget, then writes the controller that drives it; matches run offline and come out the same every time. 1v1 / 2v2 / 3v3, seven maps, pickups, and an MCP server so a player's own agent can design and test. Node 20+. Open `ironyard/dist/index.html` to watch a match, or read the [README](ironyard/README.md).
- [`tonight-i-pay/`](tonight-i-pay/) — **Tonight, I Pay**（《今晚，我买单》）. An interactive short drama in Chinese: vertical video, first person, timed choices, four episodes. The clips were generated with Seedance and are played by one static page. Play it at <https://renjie-liu.github.io/ai-games/tonight-i-pay/>, or run `node serve.js` in the folder; see its [README](tonight-i-pay/README.md).

## Website

`.github/workflows/pages.yml` publishes a landing page (`site/`) and each game's built page to GitHub Pages whenever `main` changes: <https://renjie-liu.github.io/ai-games/>, with Ironyard at `/ironyard/` and Tonight, I Pay at `/tonight-i-pay/`.

It needs GitHub Pages switched on once: Settings → Pages → Build and deployment → Source: **GitHub Actions**. On a free account Pages is only available for public repositories.
