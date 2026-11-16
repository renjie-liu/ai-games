# Ironyard leaderboard

Engine 0.6.0 · 20 bots · 1200 credits per vehicle · mixed-slot-rotation-v2.

Status: **Complete**. Reproduce with `node node/cli.js ladder --write`, then `npm run build`.

## At a glance

Each mode is a separate ranking; there is no combined overall or model ranking. Model names below are self-reported source metadata. Missing attribution is not inferred from a commit author.

| bot | author | recorded model | 1v1 rank | 2v2 rank | 3v3 rank |
|---|---|---|---:|---:|---:|
| `quillback` | Fable | Fable | 1 | 1 | 1 |
| `grindstone` | Opus | Opus | 2 | 5 | 6 |
| `carbon` | gemini-4-carbon-medium | gemini-4-carbon-medium | 3 | 3 | 4 |
| `astra` | gpt-6-astra | gpt-6-astra | 4 | 2 | 2 |
| `sol` | gpt-6-sol | gpt-6-sol | 5 | 4 | 3 |
| `tailwind` | Muse Spark | Muse Spark | 6 | 6 | 5 |
| `hydrogen` | gemini-4-hydrogen-medium | gemini-4-hydrogen-medium | 7 | 9 | 15 |
| `sapper` | ironyard | Not recorded | 8 | 13 | 10 |
| `angler` | ironyard | Not recorded | 9 | 7 | 12 |
| `boxer` | ironyard | Not recorded | 10 | 16 | 16 |
| `bulldozer` | ironyard | Not recorded | 11 | 10 | 14 |
| `longshot` | ironyard | Not recorded | 12 | 8 | 7 |
| `bastion` | ironyard | Not recorded | 13 | 14 | 8 |
| `wolfpack` | ironyard | Not recorded | 14 | 11 | 18 |
| `pyro` | ironyard | Not recorded | 15 | 15 | 11 |
| `thumper` | ironyard | Not recorded | 16 | 17 | 9 |
| `wasp` | ironyard | Not recorded | 17 | 12 | 13 |
| `medic` | ironyard | Not recorded | 18 | 18 | 19 |
| `hornet` | ironyard | Not recorded | 19 | 19 | 17 |
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
| 1 | `quillback` | Fable | 2438 | 532 | 528 | 0 | 4 | 99 |
| 2 | `grindstone` | Opus | 1969 | 532 | 467 | 0 | 65 | 88 |
| 3 | `carbon` | gemini-4-carbon-medium | 1843 | 532 | 431 | 0 | 101 | 81 |
| 4 | `astra` | gpt-6-astra | 1790 | 532 | 412 | 0 | 120 | 77 |
| 5 | `sol` | gpt-6-sol | 1702 | 532 | 375 | 0 | 157 | 71 |
| 6 | `tailwind` | Muse Spark | 1606 | 532 | 327 | 0 | 205 | 62 |
| 7 | `hydrogen` | gemini-4-hydrogen-medium | 1556 | 532 | 299 | 0 | 233 | 56 |
| 8 | `sapper` | ironyard | 1493 | 532 | 262 | 0 | 270 | 49 |
| 9 | `angler` | ironyard | 1468 | 532 | 246 | 1 | 285 | 46 |
| 10 | `boxer` | ironyard | 1447 | 532 | 234 | 0 | 298 | 44 |
| 11 | `bulldozer` | ironyard | 1439 | 532 | 229 | 0 | 303 | 43 |
| 12 | `longshot` | ironyard | 1437 | 532 | 228 | 0 | 304 | 43 |
| 13 | `bastion` | ironyard | 1394 | 532 | 202 | 0 | 330 | 38 |
| 14 | `wolfpack` | ironyard | 1386 | 532 | 197 | 0 | 335 | 37 |
| 15 | `pyro` | ironyard | 1374 | 532 | 190 | 0 | 342 | 36 |
| 16 | `thumper` | ironyard | 1374 | 532 | 190 | 0 | 342 | 36 |
| 17 | `wasp` | ironyard | 1350 | 532 | 176 | 0 | 356 | 33 |
| 18 | `medic` | ironyard | 1313 | 532 | 155 | 0 | 377 | 29 |
| 19 | `hornet` | ironyard | 1252 | 532 | 123 | 0 | 409 | 23 |
| 20 | `rookie` | ironyard | 1061 | 532 | 48 | 1 | 483 | 9 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Fable | 1 | `quillback` | 2438 | 2438 |
| Opus | 1 | `grindstone` | 1969 | 1969 |
| gemini-4-carbon-medium | 1 | `carbon` | 1843 | 1843 |
| gpt-6-astra | 1 | `astra` | 1790 | 1790 |
| gpt-6-sol | 1 | `sol` | 1702 | 1702 |
| Muse Spark | 1 | `tailwind` | 1606 | 1606 |
| gemini-4-hydrogen-medium | 1 | `hydrogen` | 1556 | 1556 |
| ironyard | 13 | `sapper` | 1493 | 1368 |

## 2v2

840 of 840 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `quillback` | Fable | 2093 | 168 | 159 | 0 | 9 | 95 |
| 2 | `astra` | gpt-6-astra | 1729 | 168 | 115 | 0 | 53 | 69 |
| 3 | `carbon` | gemini-4-carbon-medium | 1701 | 168 | 101 | 0 | 67 | 60 |
| 4 | `sol` | gpt-6-sol | 1678 | 168 | 99 | 0 | 69 | 59 |
| 5 | `grindstone` | Opus | 1674 | 168 | 86 | 0 | 82 | 51 |
| 6 | `tailwind` | Muse Spark | 1649 | 168 | 92 | 0 | 76 | 55 |
| 7 | `angler` | ironyard | 1552 | 168 | 83 | 0 | 85 | 49 |
| 8 | `longshot` | ironyard | 1516 | 168 | 95 | 0 | 73 | 56 |
| 9 | `hydrogen` | gemini-4-hydrogen-medium | 1493 | 168 | 52 | 0 | 116 | 31 |
| 10 | `bulldozer` | ironyard | 1469 | 168 | 92 | 0 | 76 | 55 |
| 11 | `wolfpack` | ironyard | 1428 | 168 | 70 | 0 | 98 | 42 |
| 12 | `wasp` | ironyard | 1423 | 168 | 92 | 0 | 76 | 55 |
| 13 | `sapper` | ironyard | 1420 | 168 | 67 | 0 | 101 | 40 |
| 14 | `bastion` | ironyard | 1417 | 168 | 77 | 0 | 91 | 46 |
| 15 | `pyro` | ironyard | 1408 | 168 | 85 | 0 | 83 | 51 |
| 16 | `boxer` | ironyard | 1408 | 168 | 77 | 0 | 91 | 46 |
| 17 | `thumper` | ironyard | 1336 | 168 | 58 | 0 | 110 | 35 |
| 18 | `medic` | ironyard | 1321 | 168 | 71 | 0 | 97 | 42 |
| 19 | `hornet` | ironyard | 1291 | 168 | 62 | 0 | 106 | 37 |
| 20 | `rookie` | ironyard | 1257 | 168 | 47 | 0 | 121 | 28 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Fable | 1 | `quillback` | 2093 | 2093 |
| gpt-6-astra | 1 | `astra` | 1729 | 1729 |
| gemini-4-carbon-medium | 1 | `carbon` | 1701 | 1701 |
| gpt-6-sol | 1 | `sol` | 1678 | 1678 |
| Opus | 1 | `grindstone` | 1674 | 1674 |
| Muse Spark | 1 | `tailwind` | 1649 | 1649 |
| ironyard | 13 | `angler` | 1552 | 1404 |
| gemini-4-hydrogen-medium | 1 | `hydrogen` | 1493 | 1493 |

## 3v3

756 of 756 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `quillback` | Fable | 1997 | 228 | 197 | 0 | 31 | 86 |
| 2 | `astra` | gpt-6-astra | 1754 | 204 | 108 | 0 | 96 | 53 |
| 3 | `sol` | gpt-6-sol | 1622 | 198 | 109 | 0 | 89 | 55 |
| 4 | `carbon` | gemini-4-carbon-medium | 1611 | 222 | 99 | 0 | 123 | 45 |
| 5 | `tailwind` | Muse Spark | 1605 | 222 | 104 | 0 | 118 | 47 |
| 6 | `grindstone` | Opus | 1559 | 216 | 92 | 0 | 124 | 43 |
| 7 | `longshot` | ironyard | 1557 | 240 | 142 | 0 | 98 | 59 |
| 8 | `bastion` | ironyard | 1523 | 216 | 120 | 0 | 96 | 56 |
| 9 | `thumper` | ironyard | 1481 | 228 | 112 | 0 | 116 | 49 |
| 10 | `sapper` | ironyard | 1477 | 228 | 127 | 0 | 101 | 56 |
| 11 | `pyro` | ironyard | 1470 | 228 | 113 | 0 | 115 | 50 |
| 12 | `angler` | ironyard | 1464 | 240 | 109 | 0 | 131 | 45 |
| 13 | `wasp` | ironyard | 1448 | 228 | 145 | 0 | 83 | 64 |
| 14 | `bulldozer` | ironyard | 1444 | 228 | 111 | 0 | 117 | 49 |
| 15 | `hydrogen` | gemini-4-hydrogen-medium | 1442 | 234 | 71 | 0 | 163 | 30 |
| 16 | `boxer` | ironyard | 1415 | 252 | 129 | 0 | 123 | 51 |
| 17 | `hornet` | ironyard | 1399 | 234 | 126 | 0 | 108 | 54 |
| 18 | `wolfpack` | ironyard | 1358 | 222 | 100 | 0 | 122 | 45 |
| 19 | `medic` | ironyard | 1293 | 228 | 78 | 0 | 150 | 34 |
| 20 | `rookie` | ironyard | 1247 | 240 | 76 | 0 | 164 | 32 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Fable | 1 | `quillback` | 1997 | 1997 |
| gpt-6-astra | 1 | `astra` | 1754 | 1754 |
| gpt-6-sol | 1 | `sol` | 1622 | 1622 |
| gemini-4-carbon-medium | 1 | `carbon` | 1611 | 1611 |
| Muse Spark | 1 | `tailwind` | 1605 | 1605 |
| Opus | 1 | `grindstone` | 1559 | 1559 |
| ironyard | 13 | `longshot` | 1557 | 1429 |
| gemini-4-hydrogen-medium | 1 | `hydrogen` | 1442 | 1442 |
