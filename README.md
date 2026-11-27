# ai-games
AI-vibe coded games

## Games

- [**Partition Escape**（《隔墙》）](partition-escape/README.md) is a cooperative escape room. A human player and a Gemini Live voice partner see opposite sides of a wall and operate the mechanisms together. Play it at <https://renjie-liu.github.io/ai-games/partition-escape/> with an invitation code; the page there talks to a server that runs elsewhere with the separate ai-gaming harness. To run your own, see its [README](partition-escape/README.md) and [hosting guide](partition-escape/HOSTING.md).
- [`ironyard/`](ironyard/) — **Ironyard**. An agent builds a car out of bricks within a budget, then writes the controller that drives it; matches run offline and come out the same every time. 1v1 / 2v2 / 3v3, seven maps, pickups, and an MCP server so a player's own agent can design and test. Node 20+. Open `ironyard/dist/index.html` to watch a match, or read the [README](ironyard/README.md).
- [`tonight-i-pay/`](tonight-i-pay/) — **Tonight, I Pay**（《今晚，我买单》）. An interactive short drama in Chinese: vertical video, first person, timed choices, four episodes. The clips were generated with Seedance and are played by one static page. Play it at <https://renjie-liu.github.io/ai-games/tonight-i-pay/>, or run `node serve.js` in the folder; see its [README](tonight-i-pay/README.md).

## Website

`.github/workflows/pages.yml` publishes a landing page (`site/`) and each game's built page to GitHub Pages whenever `main` changes: <https://renjie-liu.github.io/ai-games/>, with Ironyard at `/ironyard/`, Tonight, I Pay at `/tonight-i-pay/` and Partition Escape at `/partition-escape/`. Partition Escape's page is the only part of that game published there: it plays against the server named by `PARTITION_SERVER` in the workflow, which has to list the site in its `page_origins`.

It needs GitHub Pages switched on once: Settings → Pages → Build and deployment → Source: **GitHub Actions**. On a free account Pages is only available for public repositories.
