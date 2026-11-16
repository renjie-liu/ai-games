# Seven-entry tournament — 2026-11-15

Fable (Quillback), Opus (Grindstone), Sol, Astra, Carbon, Hydrogen and Muse Spark (Tailwind) played **2016 matches** across three separate round robins. All matches completed with no reported controller errors. The repository owner confirmed the Fable/Opus attribution; exact versions were not supplied.

All 1440 matches from the [previous six-entry tournament](https://github.com/renjie-liu/ai-games/blob/05042aa23077383345aa763194e6e7bfd6a871a7/ironyard/TOURNAMENT.md) were rerun and reproduced exactly, including outcomes, hull scores and durations. The additional 576 matches involve Muse. Tailwind comes unchanged from [PR #8](https://github.com/renjie-liu/ai-games/pull/8).

## Format

- Engine 0.5.0, Node v24.22.1; 1200 credits per vehicle.
- Seven entrants, all eight maps, seeds 1 and 2, both spawn sides.
- 672 matches per mode: 21 pairings × 8 maps × 2 seeds × 2 sides. Each entrant plays 192 matches, with 32 against each opponent.
- In 2v2 and 3v3, one entrant fills every slot on its own team; its design/controller can still vary by slot.
- Win = 3 points, draw = 1, loss = 0. Ties use accumulated hull difference, then bot id.
- Each mode is ranked separately. These results describe the submitted programs against this seven-entry field; they do not measure general model capability.
- This tournament is separate from the 20-bot mixed-team [saved ladder](LEADERBOARD.md). It does not replace its ratings.

## Rank overview

| Entry | Bot | 1v1 | 2v2 | 3v3 |
|---|---|---:|---:|---:|
| Fable | `quillback` | 1 | 2 | 1 |
| Sol | `sol` | 2 | 5 | 4 |
| Astra | `astra` | 3 | 1 | 2 |
| Carbon | `carbon` | 4 | 3 | 5 |
| Muse | `tailwind` | 5 | 4 | 3 |
| Opus | `grindstone` | 6 | 6 | 6 |
| Hydrogen | `hydrogen` | 7 | 7 | 7 |

## 1v1

| Rank | Entry | Points | W | D | L | Win % | Hull difference |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | Fable | 399 | 133 | 0 | 59 | 69.3 | 53.88 |
| 2 | Sol | 375 | 125 | 0 | 67 | 65.1 | 37.71 |
| 3 | Astra | 360 | 120 | 0 | 72 | 62.5 | 41.00 |
| 4 | Carbon | 339 | 113 | 0 | 79 | 58.9 | 10.79 |
| 5 | Muse | 327 | 109 | 0 | 83 | 56.8 | 17.58 |
| 6 | Opus | 183 | 61 | 0 | 131 | 31.8 | -41.17 |
| 7 | Hydrogen | 33 | 11 | 0 | 181 | 5.7 | -119.79 |

Head to head: row versus column, **W-D-L**, 32 matches per pairing.

| Entry | Fable | Sol | Astra | Carbon | Muse | Opus | Hydrogen |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Fable | — | 21-0-11 | 11-0-21 | 27-0-5 | 20-0-12 | 24-0-8 | 30-0-2 |
| Sol | 11-0-21 | — | 21-0-11 | 9-0-23 | 25-0-7 | 30-0-2 | 29-0-3 |
| Astra | 21-0-11 | 11-0-21 | — | 17-0-15 | 11-0-21 | 32-0-0 | 28-0-4 |
| Carbon | 5-0-27 | 23-0-9 | 15-0-17 | — | 22-0-10 | 17-0-15 | 31-0-1 |
| Muse | 12-0-20 | 7-0-25 | 21-0-11 | 10-0-22 | — | 27-0-5 | 32-0-0 |
| Opus | 8-0-24 | 2-0-30 | 0-0-32 | 15-0-17 | 5-0-27 | — | 31-0-1 |
| Hydrogen | 2-0-30 | 3-0-29 | 4-0-28 | 1-0-31 | 0-0-32 | 1-0-31 | — |

## 2v2

| Rank | Entry | Points | W | D | L | Win % | Hull difference |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | Astra | 447 | 149 | 0 | 43 | 77.6 | 145.39 |
| 2 | Fable | 423 | 141 | 0 | 51 | 73.4 | 120.69 |
| 3 | Carbon | 327 | 109 | 0 | 83 | 56.8 | 22.31 |
| 4 | Muse | 285 | 95 | 0 | 97 | 49.5 | -9.43 |
| 5 | Sol | 258 | 86 | 0 | 106 | 44.8 | -36.80 |
| 6 | Opus | 186 | 62 | 0 | 130 | 32.3 | -82.80 |
| 7 | Hydrogen | 90 | 30 | 0 | 162 | 15.6 | -159.36 |

Head to head: row versus column, **W-D-L**, 32 matches per pairing.

| Entry | Astra | Fable | Carbon | Muse | Sol | Opus | Hydrogen |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Astra | — | 25-0-7 | 16-0-16 | 21-0-11 | 25-0-7 | 31-0-1 | 31-0-1 |
| Fable | 7-0-25 | — | 30-0-2 | 25-0-7 | 23-0-9 | 26-0-6 | 30-0-2 |
| Carbon | 16-0-16 | 2-0-30 | — | 19-0-13 | 22-0-10 | 20-0-12 | 30-0-2 |
| Muse | 11-0-21 | 7-0-25 | 13-0-19 | — | 15-0-17 | 26-0-6 | 23-0-9 |
| Sol | 7-0-25 | 9-0-23 | 10-0-22 | 17-0-15 | — | 24-0-8 | 19-0-13 |
| Opus | 1-0-31 | 6-0-26 | 12-0-20 | 6-0-26 | 8-0-24 | — | 29-0-3 |
| Hydrogen | 1-0-31 | 2-0-30 | 2-0-30 | 9-0-23 | 13-0-19 | 3-0-29 | — |

## 3v3

| Rank | Entry | Points | W | D | L | Win % | Hull difference |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | Fable | 432 | 144 | 0 | 48 | 75.0 | 191.59 |
| 2 | Astra | 408 | 136 | 0 | 56 | 70.8 | 126.49 |
| 3 | Muse | 327 | 109 | 0 | 83 | 56.8 | 48.84 |
| 4 | Sol | 327 | 109 | 0 | 83 | 56.8 | 18.26 |
| 5 | Carbon | 243 | 81 | 0 | 111 | 42.2 | -55.23 |
| 6 | Opus | 234 | 78 | 0 | 114 | 40.6 | -49.91 |
| 7 | Hydrogen | 45 | 15 | 0 | 177 | 7.8 | -280.03 |

Head to head: row versus column, **W-D-L**, 32 matches per pairing.

| Entry | Fable | Astra | Muse | Sol | Carbon | Opus | Hydrogen |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Fable | — | 13-0-19 | 22-0-10 | 23-0-9 | 29-0-3 | 25-0-7 | 32-0-0 |
| Astra | 19-0-13 | — | 16-0-16 | 16-0-16 | 26-0-6 | 27-0-5 | 32-0-0 |
| Muse | 10-0-22 | 16-0-16 | — | 14-0-18 | 18-0-14 | 26-0-6 | 25-0-7 |
| Sol | 9-0-23 | 16-0-16 | 18-0-14 | — | 14-0-18 | 23-0-9 | 29-0-3 |
| Carbon | 3-0-29 | 6-0-26 | 14-0-18 | 18-0-14 | — | 11-0-21 | 29-0-3 |
| Opus | 7-0-25 | 5-0-27 | 6-0-26 | 9-0-23 | 21-0-11 | — | 30-0-2 |
| Hydrogen | 0-0-32 | 0-0-32 | 7-0-25 | 3-0-29 | 3-0-29 | 2-0-30 | — |

## Reproduce and inspect

Execution used the same `makeSchedule`, `MatchPool` and `standings` routines as the CLI, checking each returned controller error list before accepting a match. The settings can be reproduced from the `ironyard/` directory:

```bash
node node/cli.js tournament --bots quillback,grindstone,sol,astra,carbon,hydrogen,tailwind --mode 1v1 --maps all --seeds 2 --budget 1200 --json > tournament-1v1.json
node node/cli.js tournament --bots quillback,grindstone,sol,astra,carbon,hydrogen,tailwind --mode 2v2 --maps all --seeds 2 --budget 1200 --json > tournament-2v2.json
node node/cli.js tournament --bots quillback,grindstone,sol,astra,carbon,hydrogen,tailwind --mode 3v3 --maps all --seeds 2 --budget 1200 --json > tournament-3v3.json
```

[Raw results, standings and source hashes](docs/tournaments/seven-models-2026-11-15.json) include every map, seed, side, outcome, hull score, ending reason and reported controller error list.

| Entry | Recorded model | Source SHA-256 |
|---|---|---|
| Fable | Fable | `a036f97bab1cda23c03a66b78c2b6a715d72b9559546970e86548d523053783d` |
| Opus | Opus | `afa5449beb2a10224d2ae236cd999c2bc22b9bd3bc49d6ac58de324da998a685` |
| Sol | gpt-6-sol | `baff6aff0b7d1f1f012bdb6d88e671211725a2bb9390b913e1c1f96a3242202c` |
| Astra | gpt-6-astra | `b862bf32f015b1f50ea94731b25db2258a7a356bff4492a8a9290d79717934da` |
| Carbon | gemini-4-carbon-medium | `bf41cf9bf8482472a128aa048090e2a91e6b1beb0a1b029caea42b9e9deec8fd` |
| Hydrogen | gemini-4-hydrogen-medium | `2ad278cbf12954bb84052dfbe02c0f3e0744ec44f8c14448815ddb32297ecd94` |
| Muse | Muse Spark | `a45ed88191cdc189480a4b2110f621a935d43e6260268784e1c82f8287022247` |
