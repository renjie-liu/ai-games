# Ironyard leaderboard

Engine 0.6.0 · 20 bots · 1200 credits per vehicle · mixed-slot-rotation-v2.

Status: **Complete**. Reproduce with `node node/cli.js ladder --write`, then `npm run build`.

## At a glance

Each mode is a separate ranking; there is no combined overall or model ranking. Model names below are self-reported source metadata. Missing attribution is not inferred from a commit author.

| bot | author | recorded model | 1v1 rank | 2v2 rank | 3v3 rank |
|---|---|---|---:|---:|---:|
| `quillback` | Fable | Fable | 1 | 2 | 1 |
| `sol` | gpt-6-sol | gpt-6-sol | 2 | 1 | 2 |
| `astra` | gpt-6-astra | gpt-6-astra | 3 | 3 | 3 |
| `grindstone` | Opus | Opus | 4 | 6 | 6 |
| `carbon` | gemini-4-carbon-medium | gemini-4-carbon-medium | 5 | 5 | 4 |
| `hydrogen` | gemini-4-hydrogen-medium | gemini-4-hydrogen-medium | 6 | 8 | 10 |
| `tailwind` | Muse Spark | Muse Spark | 7 | 4 | 5 |
| `sapper` | ironyard | Not recorded | 8 | 15 | 13 |
| `angler` | ironyard | Not recorded | 9 | 7 | 14 |
| `boxer` | ironyard | Not recorded | 10 | 12 | 15 |
| `bulldozer` | ironyard | Not recorded | 11 | 9 | 9 |
| `longshot` | ironyard | Not recorded | 12 | 11 | 7 |
| `bastion` | ironyard | Not recorded | 13 | 10 | 8 |
| `wolfpack` | ironyard | Not recorded | 14 | 14 | 18 |
| `thumper` | ironyard | Not recorded | 15 | 18 | 11 |
| `pyro` | ironyard | Not recorded | 16 | 13 | 16 |
| `wasp` | ironyard | Not recorded | 17 | 16 | 12 |
| `medic` | ironyard | Not recorded | 18 | 20 | 20 |
| `hornet` | ironyard | Not recorded | 19 | 17 | 17 |
| `rookie` | ironyard | Not recorded | 20 | 19 | 19 |

## How to read the rankings

- **1v1:** every pair plays all 14 maps from both spawn sides, with seed 1.
- **2v2 / 3v3:** 42 deterministic mixed-team rounds, going round the maps in turn, balanced across authors where possible. Each pairing rotates through every team slot, from both spawn sides. Some entrants sit out each round, so game counts differ.
- **Strength (Elo scale):** a joint logistic fit to all results, with a 1500 anchor equivalent to two draws. Team strength is the sum of individual ratings above 1500. Wins count 1, draws 0.5, losses 0. Opponent and teammate strength matter; raw win rate does not determine rank.
- **Ordering:** unrounded rating, then win rate, then bot id. Displayed ratings are rounded. Bots with zero games are unranked. Author tables sort by the author’s best bot, then mean rating.
- **Scope:** these are fixed-season results, not confidence intervals or a general model benchmark. Team synergy is approximated as additive. Close scores and small samples warrant more seeds/rounds.
- **Custom tournaments:** use the same batch strength fit and ordering, rating each whole entrant once per match. One bot fills its entire team by default; those results stay separate from this mixed-team ladder. Scores from different fields or modes are not directly comparable.

See [ranking methodology and audit](docs/RANKING.md) for details, error handling and limitations.

## 1v1

5320 of 5320 matches on file.

| # | bot | author | strength (Elo scale) | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `quillback` | Fable | 2055 | 532 | 487 | 0 | 45 | 92 |
| 2 | `sol` | gpt-6-sol | 2051 | 532 | 486 | 0 | 46 | 91 |
| 3 | `astra` | gpt-6-astra | 1947 | 532 | 459 | 0 | 73 | 86 |
| 4 | `grindstone` | Opus | 1847 | 532 | 427 | 0 | 105 | 80 |
| 5 | `carbon` | gemini-4-carbon-medium | 1789 | 532 | 406 | 0 | 126 | 76 |
| 6 | `hydrogen` | gemini-4-hydrogen-medium | 1577 | 532 | 309 | 0 | 223 | 58 |
| 7 | `tailwind` | Muse Spark | 1568 | 532 | 304 | 0 | 228 | 57 |
| 8 | `sapper` | ironyard | 1484 | 532 | 257 | 0 | 275 | 48 |
| 9 | `angler` | ironyard | 1478 | 532 | 253 | 1 | 278 | 48 |
| 10 | `boxer` | ironyard | 1449 | 532 | 236 | 0 | 296 | 44 |
| 11 | `bulldozer` | ironyard | 1437 | 532 | 229 | 0 | 303 | 43 |
| 12 | `longshot` | ironyard | 1410 | 532 | 213 | 0 | 319 | 40 |
| 13 | `bastion` | ironyard | 1396 | 532 | 205 | 0 | 327 | 39 |
| 14 | `wolfpack` | ironyard | 1380 | 532 | 196 | 0 | 336 | 37 |
| 15 | `thumper` | ironyard | 1355 | 532 | 181 | 0 | 351 | 34 |
| 16 | `pyro` | ironyard | 1351 | 532 | 179 | 0 | 353 | 34 |
| 17 | `wasp` | ironyard | 1319 | 532 | 161 | 0 | 371 | 30 |
| 18 | `medic` | ironyard | 1315 | 532 | 159 | 0 | 373 | 30 |
| 19 | `hornet` | ironyard | 1246 | 532 | 123 | 0 | 409 | 23 |
| 20 | `rookie` | ironyard | 1058 | 532 | 49 | 1 | 482 | 9 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Fable | 1 | `quillback` | 2055 | 2055 |
| gpt-6-sol | 1 | `sol` | 2051 | 2051 |
| gpt-6-astra | 1 | `astra` | 1947 | 1947 |
| Opus | 1 | `grindstone` | 1847 | 1847 |
| gemini-4-carbon-medium | 1 | `carbon` | 1789 | 1789 |
| gemini-4-hydrogen-medium | 1 | `hydrogen` | 1577 | 1577 |
| Muse Spark | 1 | `tailwind` | 1568 | 1568 |
| ironyard | 13 | `sapper` | 1484 | 1360 |

## 2v2

840 of 840 matches on file.

| # | bot | author | strength (Elo scale) | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `sol` | gpt-6-sol | 1971 | 168 | 143 | 0 | 25 | 85 |
| 2 | `quillback` | Fable | 1902 | 168 | 138 | 0 | 30 | 82 |
| 3 | `astra` | gpt-6-astra | 1781 | 168 | 124 | 0 | 44 | 74 |
| 4 | `tailwind` | Muse Spark | 1678 | 168 | 92 | 0 | 76 | 55 |
| 5 | `carbon` | gemini-4-carbon-medium | 1648 | 168 | 86 | 0 | 82 | 51 |
| 6 | `grindstone` | Opus | 1632 | 168 | 78 | 0 | 90 | 46 |
| 7 | `angler` | ironyard | 1567 | 168 | 76 | 0 | 92 | 45 |
| 8 | `hydrogen` | gemini-4-hydrogen-medium | 1538 | 168 | 57 | 0 | 111 | 34 |
| 9 | `bulldozer` | ironyard | 1472 | 168 | 97 | 0 | 71 | 58 |
| 10 | `bastion` | ironyard | 1467 | 168 | 81 | 0 | 87 | 48 |
| 11 | `longshot` | ironyard | 1450 | 168 | 85 | 0 | 83 | 51 |
| 12 | `boxer` | ironyard | 1403 | 168 | 81 | 0 | 87 | 48 |
| 13 | `pyro` | ironyard | 1401 | 168 | 84 | 0 | 84 | 50 |
| 14 | `wolfpack` | ironyard | 1389 | 168 | 71 | 0 | 97 | 42 |
| 15 | `sapper` | ironyard | 1385 | 168 | 65 | 0 | 103 | 39 |
| 16 | `wasp` | ironyard | 1385 | 168 | 82 | 0 | 86 | 49 |
| 17 | `hornet` | ironyard | 1329 | 168 | 70 | 0 | 98 | 42 |
| 18 | `thumper` | ironyard | 1327 | 168 | 55 | 0 | 113 | 33 |
| 19 | `rookie` | ironyard | 1270 | 168 | 51 | 0 | 117 | 30 |
| 20 | `medic` | ironyard | 1269 | 168 | 64 | 0 | 104 | 38 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| gpt-6-sol | 1 | `sol` | 1971 | 1971 |
| Fable | 1 | `quillback` | 1902 | 1902 |
| gpt-6-astra | 1 | `astra` | 1781 | 1781 |
| Muse Spark | 1 | `tailwind` | 1678 | 1678 |
| gemini-4-carbon-medium | 1 | `carbon` | 1648 | 1648 |
| Opus | 1 | `grindstone` | 1632 | 1632 |
| ironyard | 13 | `angler` | 1567 | 1393 |
| gemini-4-hydrogen-medium | 1 | `hydrogen` | 1538 | 1538 |

## 3v3

756 of 756 matches on file.

| # | bot | author | strength (Elo scale) | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `quillback` | Fable | 1940 | 228 | 173 | 0 | 55 | 76 |
| 2 | `sol` | gpt-6-sol | 1863 | 198 | 154 | 0 | 44 | 78 |
| 3 | `astra` | gpt-6-astra | 1856 | 204 | 137 | 0 | 67 | 67 |
| 4 | `carbon` | gemini-4-carbon-medium | 1591 | 222 | 86 | 0 | 136 | 39 |
| 5 | `tailwind` | Muse Spark | 1577 | 222 | 88 | 0 | 134 | 40 |
| 6 | `grindstone` | Opus | 1545 | 216 | 71 | 0 | 145 | 33 |
| 7 | `longshot` | ironyard | 1531 | 240 | 141 | 0 | 99 | 59 |
| 8 | `bastion` | ironyard | 1511 | 216 | 114 | 0 | 102 | 53 |
| 9 | `bulldozer` | ironyard | 1509 | 228 | 134 | 0 | 94 | 59 |
| 10 | `hydrogen` | gemini-4-hydrogen-medium | 1493 | 234 | 75 | 0 | 159 | 32 |
| 11 | `thumper` | ironyard | 1453 | 228 | 115 | 0 | 113 | 50 |
| 12 | `wasp` | ironyard | 1445 | 228 | 149 | 0 | 79 | 65 |
| 13 | `sapper` | ironyard | 1438 | 228 | 107 | 0 | 121 | 47 |
| 14 | `angler` | ironyard | 1434 | 240 | 116 | 0 | 124 | 48 |
| 15 | `boxer` | ironyard | 1419 | 252 | 135 | 0 | 117 | 54 |
| 16 | `pyro` | ironyard | 1402 | 228 | 90 | 0 | 138 | 40 |
| 17 | `hornet` | ironyard | 1362 | 234 | 124 | 0 | 110 | 53 |
| 18 | `wolfpack` | ironyard | 1313 | 222 | 97 | 0 | 125 | 44 |
| 19 | `rookie` | ironyard | 1299 | 240 | 88 | 0 | 152 | 37 |
| 20 | `medic` | ironyard | 1265 | 228 | 74 | 0 | 154 | 33 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Fable | 1 | `quillback` | 1940 | 1940 |
| gpt-6-sol | 1 | `sol` | 1863 | 1863 |
| gpt-6-astra | 1 | `astra` | 1856 | 1856 |
| gemini-4-carbon-medium | 1 | `carbon` | 1591 | 1591 |
| Muse Spark | 1 | `tailwind` | 1577 | 1577 |
| Opus | 1 | `grindstone` | 1545 | 1545 |
| ironyard | 13 | `longshot` | 1531 | 1414 |
| gemini-4-hydrogen-medium | 1 | `hydrogen` | 1493 | 1493 |
