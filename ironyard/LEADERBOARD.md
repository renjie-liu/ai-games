# Ironyard leaderboard

Engine 0.6.0 · 20 bots · 1200 credits per vehicle · mixed-slot-rotation-v2.

Status: **Complete**. Reproduce with `node node/cli.js ladder --write`, then `npm run build`.

## At a glance

Each mode is a separate ranking; there is no combined overall or model ranking. Model names below are self-reported source metadata. Missing attribution is not inferred from a commit author.

| bot | author | recorded model | 1v1 rank | 2v2 rank | 3v3 rank |
|---|---|---|---:|---:|---:|
| `grindstone` | Opus | Opus | 1 | 3 | 6 |
| `quillback` | Fable | Fable | 2 | 1 | 2 |
| `carbon` | gemini-4-carbon-medium | gemini-4-carbon-medium | 3 | 4 | 5 |
| `astra` | gpt-6-astra | gpt-6-astra | 4 | 2 | 1 |
| `sol` | gpt-6-sol | gpt-6-sol | 5 | 5 | 3 |
| `tailwind` | Muse Spark | Muse Spark | 6 | 6 | 4 |
| `hydrogen` | gemini-4-hydrogen-medium | gemini-4-hydrogen-medium | 7 | 7 | 8 |
| `sapper` | ironyard | Not recorded | 8 | 13 | 12 |
| `angler` | ironyard | Not recorded | 9 | 8 | 13 |
| `longshot` | ironyard | Not recorded | 10 | 9 | 7 |
| `boxer` | ironyard | Not recorded | 11 | 15 | 17 |
| `bulldozer` | ironyard | Not recorded | 12 | 14 | 14 |
| `bastion` | ironyard | Not recorded | 13 | 16 | 11 |
| `wolfpack` | ironyard | Not recorded | 14 | 10 | 18 |
| `pyro` | ironyard | Not recorded | 15 | 11 | 10 |
| `thumper` | ironyard | Not recorded | 16 | 17 | 9 |
| `wasp` | ironyard | Not recorded | 17 | 12 | 15 |
| `medic` | ironyard | Not recorded | 18 | 18 | 19 |
| `hornet` | ironyard | Not recorded | 19 | 19 | 16 |
| `rookie` | ironyard | Not recorded | 20 | 20 | 20 |

## How to read the rankings

- **1v1:** every pair plays all 14 maps from both spawn sides, with seed 1.
- **2v2 / 3v3:** 42 deterministic mixed-team rounds, going round the maps in turn, balanced across authors where possible. Each pairing rotates through every team slot, from both spawn sides. Some entrants sit out each round, so game counts differ.
- **Rating:** a joint logistic fit to all results, with a 1500 anchor equivalent to two draws. Team strength is the sum of individual ratings above 1500. Wins count 1, draws 0.5, losses 0. Opponent and teammate strength matter; raw win rate does not determine rank.
- **Ordering:** unrounded rating, then win rate, then bot id. Displayed ratings are rounded. Bots with zero games are unranked. Author tables sort by the author’s best bot, then mean rating.
- **Scope:** these are fixed-season results, not confidence intervals or a general model benchmark. Team synergy is approximated as additive. Close scores and small samples warrant more seeds/rounds.
- **Custom tournaments:** the browser’s round robin uses 3 points per win, 1 per draw and hull difference as a tie-break. One bot fills its entire team; those results do not update this mixed-team ladder.

See [ranking methodology and audit](docs/RANKING.md) for details, error handling and limitations.

## 1v1

5320 of 5320 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `grindstone` | Opus | 2034 | 532 | 494 | 0 | 38 | 93 |
| 2 | `quillback` | Fable | 1917 | 532 | 463 | 0 | 69 | 87 |
| 3 | `carbon` | gemini-4-carbon-medium | 1832 | 532 | 434 | 0 | 98 | 82 |
| 4 | `astra` | gpt-6-astra | 1819 | 532 | 429 | 0 | 103 | 81 |
| 5 | `sol` | gpt-6-sol | 1688 | 532 | 371 | 0 | 161 | 70 |
| 6 | `tailwind` | Muse Spark | 1619 | 532 | 335 | 0 | 197 | 63 |
| 7 | `hydrogen` | gemini-4-hydrogen-medium | 1557 | 532 | 300 | 0 | 232 | 56 |
| 8 | `sapper` | ironyard | 1505 | 532 | 269 | 0 | 263 | 51 |
| 9 | `angler` | ironyard | 1470 | 532 | 247 | 1 | 284 | 46 |
| 10 | `longshot` | ironyard | 1453 | 532 | 237 | 0 | 295 | 45 |
| 11 | `boxer` | ironyard | 1444 | 532 | 232 | 0 | 300 | 44 |
| 12 | `bulldozer` | ironyard | 1436 | 532 | 227 | 0 | 305 | 43 |
| 13 | `bastion` | ironyard | 1395 | 532 | 202 | 0 | 330 | 38 |
| 14 | `wolfpack` | ironyard | 1385 | 532 | 196 | 0 | 336 | 37 |
| 15 | `pyro` | ironyard | 1377 | 532 | 191 | 0 | 341 | 36 |
| 16 | `thumper` | ironyard | 1372 | 532 | 188 | 0 | 344 | 35 |
| 17 | `wasp` | ironyard | 1355 | 532 | 178 | 0 | 354 | 34 |
| 18 | `medic` | ironyard | 1313 | 532 | 154 | 0 | 378 | 29 |
| 19 | `hornet` | ironyard | 1256 | 532 | 124 | 0 | 408 | 23 |
| 20 | `rookie` | ironyard | 1063 | 532 | 48 | 1 | 483 | 9 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Opus | 1 | `grindstone` | 2034 | 2034 |
| Fable | 1 | `quillback` | 1917 | 1917 |
| gemini-4-carbon-medium | 1 | `carbon` | 1832 | 1832 |
| gpt-6-astra | 1 | `astra` | 1819 | 1819 |
| gpt-6-sol | 1 | `sol` | 1688 | 1688 |
| Muse Spark | 1 | `tailwind` | 1619 | 1619 |
| gemini-4-hydrogen-medium | 1 | `hydrogen` | 1557 | 1557 |
| ironyard | 13 | `sapper` | 1505 | 1371 |

## 2v2

840 of 840 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `quillback` | Fable | 1797 | 168 | 130 | 0 | 38 | 77 |
| 2 | `astra` | gpt-6-astra | 1725 | 168 | 117 | 0 | 51 | 70 |
| 3 | `grindstone` | Opus | 1677 | 168 | 95 | 0 | 73 | 56 |
| 4 | `carbon` | gemini-4-carbon-medium | 1674 | 168 | 98 | 0 | 70 | 58 |
| 5 | `sol` | gpt-6-sol | 1673 | 168 | 104 | 0 | 64 | 62 |
| 6 | `tailwind` | Muse Spark | 1662 | 168 | 99 | 0 | 69 | 59 |
| 7 | `hydrogen` | gemini-4-hydrogen-medium | 1521 | 168 | 59 | 0 | 109 | 35 |
| 8 | `angler` | ironyard | 1510 | 168 | 78 | 0 | 90 | 46 |
| 9 | `longshot` | ironyard | 1503 | 168 | 95 | 0 | 73 | 56 |
| 10 | `wolfpack` | ironyard | 1448 | 168 | 76 | 0 | 92 | 45 |
| 11 | `pyro` | ironyard | 1437 | 168 | 87 | 0 | 81 | 52 |
| 12 | `wasp` | ironyard | 1435 | 168 | 89 | 0 | 79 | 53 |
| 13 | `sapper` | ironyard | 1433 | 168 | 70 | 0 | 98 | 42 |
| 14 | `bulldozer` | ironyard | 1430 | 168 | 83 | 0 | 85 | 49 |
| 15 | `boxer` | ironyard | 1423 | 168 | 81 | 0 | 87 | 48 |
| 16 | `bastion` | ironyard | 1409 | 168 | 74 | 0 | 94 | 44 |
| 17 | `thumper` | ironyard | 1364 | 168 | 62 | 0 | 106 | 37 |
| 18 | `medic` | ironyard | 1359 | 168 | 74 | 0 | 94 | 44 |
| 19 | `hornet` | ironyard | 1308 | 168 | 61 | 0 | 107 | 36 |
| 20 | `rookie` | ironyard | 1285 | 168 | 48 | 0 | 120 | 29 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Fable | 1 | `quillback` | 1797 | 1797 |
| gpt-6-astra | 1 | `astra` | 1725 | 1725 |
| Opus | 1 | `grindstone` | 1677 | 1677 |
| gemini-4-carbon-medium | 1 | `carbon` | 1674 | 1674 |
| gpt-6-sol | 1 | `sol` | 1673 | 1673 |
| Muse Spark | 1 | `tailwind` | 1662 | 1662 |
| gemini-4-hydrogen-medium | 1 | `hydrogen` | 1521 | 1521 |
| ironyard | 13 | `angler` | 1510 | 1411 |

## 3v3

756 of 756 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `astra` | gpt-6-astra | 1832 | 204 | 138 | 0 | 66 | 68 |
| 2 | `quillback` | Fable | 1754 | 228 | 135 | 0 | 93 | 59 |
| 3 | `sol` | gpt-6-sol | 1663 | 198 | 115 | 0 | 83 | 58 |
| 4 | `tailwind` | Muse Spark | 1643 | 222 | 110 | 0 | 112 | 50 |
| 5 | `carbon` | gemini-4-carbon-medium | 1640 | 222 | 100 | 0 | 122 | 45 |
| 6 | `grindstone` | Opus | 1600 | 216 | 102 | 0 | 114 | 47 |
| 7 | `longshot` | ironyard | 1538 | 240 | 147 | 0 | 93 | 61 |
| 8 | `hydrogen` | gemini-4-hydrogen-medium | 1506 | 234 | 88 | 0 | 146 | 38 |
| 9 | `thumper` | ironyard | 1498 | 228 | 130 | 0 | 98 | 57 |
| 10 | `pyro` | ironyard | 1483 | 228 | 108 | 0 | 120 | 47 |
| 11 | `bastion` | ironyard | 1476 | 216 | 115 | 0 | 101 | 53 |
| 12 | `sapper` | ironyard | 1471 | 228 | 120 | 0 | 108 | 53 |
| 13 | `angler` | ironyard | 1469 | 240 | 119 | 0 | 121 | 50 |
| 14 | `bulldozer` | ironyard | 1447 | 228 | 125 | 0 | 103 | 55 |
| 15 | `wasp` | ironyard | 1396 | 228 | 123 | 0 | 105 | 54 |
| 16 | `hornet` | ironyard | 1393 | 234 | 131 | 0 | 103 | 56 |
| 17 | `boxer` | ironyard | 1377 | 252 | 115 | 0 | 137 | 46 |
| 18 | `wolfpack` | ironyard | 1355 | 222 | 104 | 0 | 118 | 47 |
| 19 | `medic` | ironyard | 1257 | 228 | 73 | 0 | 155 | 32 |
| 20 | `rookie` | ironyard | 1253 | 240 | 70 | 0 | 170 | 29 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| gpt-6-astra | 1 | `astra` | 1832 | 1832 |
| Fable | 1 | `quillback` | 1754 | 1754 |
| gpt-6-sol | 1 | `sol` | 1663 | 1663 |
| Muse Spark | 1 | `tailwind` | 1643 | 1643 |
| gemini-4-carbon-medium | 1 | `carbon` | 1640 | 1640 |
| Opus | 1 | `grindstone` | 1600 | 1600 |
| ironyard | 13 | `longshot` | 1538 | 1416 |
| gemini-4-hydrogen-medium | 1 | `hydrogen` | 1506 | 1506 |
