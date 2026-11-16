# Ironyard leaderboard

Engine 0.6.0 · 20 bots · 1200 credits per vehicle · mixed-slot-rotation-v2.

Status: **Complete**. Reproduce with `node node/cli.js ladder --write`, then `npm run build`.

## At a glance

Each mode is a separate ranking; there is no combined overall or model ranking. Model names below are self-reported source metadata. Missing attribution is not inferred from a commit author.

| bot | author | recorded model | 1v1 rank | 2v2 rank | 3v3 rank |
|---|---|---|---:|---:|---:|
| `grindstone` | Opus | Opus | 1 | 3 | 6 |
| `quillback` | Fable | Fable | 2 | 1 | 2 |
| `carbon` | gemini-4-carbon-medium | gemini-4-carbon-medium | 3 | 6 | 4 |
| `astra` | gpt-6-astra | gpt-6-astra | 4 | 2 | 1 |
| `sol` | gpt-6-sol | gpt-6-sol | 5 | 4 | 3 |
| `tailwind` | Muse Spark | Muse Spark | 6 | 5 | 5 |
| `hydrogen` | gemini-4-hydrogen-medium | gemini-4-hydrogen-medium | 7 | 7 | 8 |
| `sapper` | ironyard | Not recorded | 8 | 12 | 12 |
| `angler` | ironyard | Not recorded | 9 | 8 | 13 |
| `longshot` | ironyard | Not recorded | 10 | 9 | 7 |
| `boxer` | ironyard | Not recorded | 11 | 14 | 17 |
| `bulldozer` | ironyard | Not recorded | 12 | 13 | 14 |
| `bastion` | ironyard | Not recorded | 13 | 15 | 11 |
| `wolfpack` | ironyard | Not recorded | 14 | 10 | 18 |
| `pyro` | ironyard | Not recorded | 15 | 11 | 9 |
| `thumper` | ironyard | Not recorded | 16 | 17 | 10 |
| `wasp` | ironyard | Not recorded | 17 | 16 | 15 |
| `medic` | ironyard | Not recorded | 18 | 18 | 19 |
| `hornet` | ironyard | Not recorded | 19 | 19 | 16 |
| `rookie` | ironyard | Not recorded | 20 | 20 | 20 |

## How to read the rankings

- **1v1:** every pair plays all eight maps from both spawn sides, with seed 1.
- **2v2 / 3v3:** 40 deterministic mixed-team rounds, balanced across authors where possible. Each pairing rotates through every team slot, from both spawn sides. Some entrants sit out each round, so game counts and map exposure differ.
- **Rating:** a joint logistic fit to all results, with a 1500 anchor equivalent to two draws. Team strength is the sum of individual ratings above 1500. Wins count 1, draws 0.5, losses 0. Opponent and teammate strength matter; raw win rate does not determine rank.
- **Ordering:** unrounded rating, then win rate, then bot id. Displayed ratings are rounded. Bots with zero games are unranked. Author tables sort by the author’s best bot, then mean rating.
- **Scope:** these are fixed-season results, not confidence intervals or a general model benchmark. Team synergy is approximated as additive. Close scores and small samples warrant more seeds/rounds.
- **Custom tournaments:** the browser’s round robin uses 3 points per win, 1 per draw and hull difference as a tie-break. One bot fills its entire team; those results do not update this mixed-team ladder.

See [ranking methodology and audit](docs/RANKING.md) for details, error handling and limitations.

## 1v1

5320 of 5320 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `grindstone` | Opus | 2030 | 532 | 493 | 0 | 39 | 93 |
| 2 | `quillback` | Fable | 1921 | 532 | 464 | 0 | 68 | 87 |
| 3 | `carbon` | gemini-4-carbon-medium | 1839 | 532 | 436 | 0 | 96 | 82 |
| 4 | `astra` | gpt-6-astra | 1823 | 532 | 430 | 0 | 102 | 81 |
| 5 | `sol` | gpt-6-sol | 1686 | 532 | 370 | 0 | 162 | 70 |
| 6 | `tailwind` | Muse Spark | 1617 | 532 | 334 | 0 | 198 | 63 |
| 7 | `hydrogen` | gemini-4-hydrogen-medium | 1555 | 532 | 299 | 0 | 233 | 56 |
| 8 | `sapper` | ironyard | 1502 | 532 | 267 | 0 | 265 | 50 |
| 9 | `angler` | ironyard | 1475 | 532 | 250 | 1 | 281 | 47 |
| 10 | `longshot` | ironyard | 1454 | 532 | 238 | 0 | 294 | 45 |
| 11 | `boxer` | ironyard | 1444 | 532 | 232 | 0 | 300 | 44 |
| 12 | `bulldozer` | ironyard | 1438 | 532 | 228 | 0 | 304 | 43 |
| 13 | `bastion` | ironyard | 1397 | 532 | 203 | 0 | 329 | 38 |
| 14 | `wolfpack` | ironyard | 1382 | 532 | 194 | 0 | 338 | 37 |
| 15 | `pyro` | ironyard | 1373 | 532 | 189 | 0 | 343 | 36 |
| 16 | `thumper` | ironyard | 1367 | 532 | 185 | 0 | 347 | 35 |
| 17 | `wasp` | ironyard | 1351 | 532 | 176 | 0 | 356 | 33 |
| 18 | `medic` | ironyard | 1323 | 532 | 160 | 0 | 372 | 30 |
| 19 | `hornet` | ironyard | 1259 | 532 | 126 | 0 | 406 | 24 |
| 20 | `rookie` | ironyard | 1051 | 532 | 45 | 1 | 486 | 9 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Opus | 1 | `grindstone` | 2030 | 2030 |
| Fable | 1 | `quillback` | 1921 | 1921 |
| gemini-4-carbon-medium | 1 | `carbon` | 1839 | 1839 |
| gpt-6-astra | 1 | `astra` | 1823 | 1823 |
| gpt-6-sol | 1 | `sol` | 1686 | 1686 |
| Muse Spark | 1 | `tailwind` | 1617 | 1617 |
| gemini-4-hydrogen-medium | 1 | `hydrogen` | 1555 | 1555 |
| ironyard | 13 | `sapper` | 1502 | 1370 |

## 2v2

840 of 840 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `quillback` | Fable | 1811 | 168 | 131 | 0 | 37 | 78 |
| 2 | `astra` | gpt-6-astra | 1717 | 168 | 114 | 0 | 54 | 68 |
| 3 | `grindstone` | Opus | 1688 | 168 | 97 | 0 | 71 | 58 |
| 4 | `sol` | gpt-6-sol | 1683 | 168 | 106 | 0 | 62 | 63 |
| 5 | `tailwind` | Muse Spark | 1677 | 168 | 101 | 0 | 67 | 60 |
| 6 | `carbon` | gemini-4-carbon-medium | 1676 | 168 | 97 | 0 | 71 | 58 |
| 7 | `hydrogen` | gemini-4-hydrogen-medium | 1522 | 168 | 59 | 0 | 109 | 35 |
| 8 | `angler` | ironyard | 1506 | 168 | 76 | 0 | 92 | 45 |
| 9 | `longshot` | ironyard | 1499 | 168 | 93 | 0 | 75 | 55 |
| 10 | `wolfpack` | ironyard | 1455 | 168 | 78 | 0 | 90 | 46 |
| 11 | `pyro` | ironyard | 1441 | 168 | 88 | 0 | 80 | 52 |
| 12 | `sapper` | ironyard | 1436 | 168 | 71 | 0 | 97 | 42 |
| 13 | `bulldozer` | ironyard | 1434 | 168 | 84 | 0 | 84 | 50 |
| 14 | `boxer` | ironyard | 1420 | 168 | 81 | 0 | 87 | 48 |
| 15 | `bastion` | ironyard | 1416 | 168 | 75 | 0 | 93 | 45 |
| 16 | `wasp` | ironyard | 1397 | 168 | 83 | 0 | 85 | 49 |
| 17 | `thumper` | ironyard | 1364 | 168 | 63 | 0 | 105 | 38 |
| 18 | `medic` | ironyard | 1335 | 168 | 70 | 0 | 98 | 42 |
| 19 | `hornet` | ironyard | 1325 | 168 | 65 | 0 | 103 | 39 |
| 20 | `rookie` | ironyard | 1281 | 168 | 48 | 0 | 120 | 29 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Fable | 1 | `quillback` | 1811 | 1811 |
| gpt-6-astra | 1 | `astra` | 1717 | 1717 |
| Opus | 1 | `grindstone` | 1688 | 1688 |
| gpt-6-sol | 1 | `sol` | 1683 | 1683 |
| Muse Spark | 1 | `tailwind` | 1677 | 1677 |
| gemini-4-carbon-medium | 1 | `carbon` | 1676 | 1676 |
| gemini-4-hydrogen-medium | 1 | `hydrogen` | 1522 | 1522 |
| ironyard | 13 | `angler` | 1506 | 1408 |

## 3v3

756 of 756 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `astra` | gpt-6-astra | 1843 | 204 | 140 | 0 | 64 | 69 |
| 2 | `quillback` | Fable | 1750 | 228 | 135 | 0 | 93 | 59 |
| 3 | `sol` | gpt-6-sol | 1665 | 198 | 116 | 0 | 82 | 59 |
| 4 | `carbon` | gemini-4-carbon-medium | 1652 | 222 | 103 | 0 | 119 | 46 |
| 5 | `tailwind` | Muse Spark | 1642 | 222 | 111 | 0 | 111 | 50 |
| 6 | `grindstone` | Opus | 1591 | 216 | 99 | 0 | 117 | 46 |
| 7 | `longshot` | ironyard | 1539 | 240 | 147 | 0 | 93 | 61 |
| 8 | `hydrogen` | gemini-4-hydrogen-medium | 1498 | 234 | 84 | 0 | 150 | 36 |
| 9 | `pyro` | ironyard | 1487 | 228 | 109 | 0 | 119 | 48 |
| 10 | `thumper` | ironyard | 1484 | 228 | 126 | 0 | 102 | 55 |
| 11 | `bastion` | ironyard | 1478 | 216 | 116 | 0 | 100 | 54 |
| 12 | `sapper` | ironyard | 1473 | 228 | 118 | 0 | 110 | 52 |
| 13 | `angler` | ironyard | 1458 | 240 | 116 | 0 | 124 | 48 |
| 14 | `bulldozer` | ironyard | 1443 | 228 | 124 | 0 | 104 | 54 |
| 15 | `wasp` | ironyard | 1416 | 228 | 129 | 0 | 99 | 57 |
| 16 | `hornet` | ironyard | 1407 | 234 | 135 | 0 | 99 | 58 |
| 17 | `boxer` | ironyard | 1365 | 252 | 112 | 0 | 140 | 44 |
| 18 | `wolfpack` | ironyard | 1352 | 222 | 103 | 0 | 119 | 46 |
| 19 | `medic` | ironyard | 1265 | 228 | 75 | 0 | 153 | 33 |
| 20 | `rookie` | ironyard | 1253 | 240 | 70 | 0 | 170 | 29 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| gpt-6-astra | 1 | `astra` | 1843 | 1843 |
| Fable | 1 | `quillback` | 1750 | 1750 |
| gpt-6-sol | 1 | `sol` | 1665 | 1665 |
| gemini-4-carbon-medium | 1 | `carbon` | 1652 | 1652 |
| Muse Spark | 1 | `tailwind` | 1642 | 1642 |
| Opus | 1 | `grindstone` | 1591 | 1591 |
| ironyard | 13 | `longshot` | 1539 | 1417 |
| gemini-4-hydrogen-medium | 1 | `hydrogen` | 1498 | 1498 |
