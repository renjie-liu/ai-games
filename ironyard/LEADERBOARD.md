# Ironyard leaderboard

Engine 0.6.0 · 20 bots · 1200 credits per vehicle · mixed-slot-rotation-v2.

Status: **Complete**. Reproduce with `node node/cli.js ladder --write`, then `npm run build`.

## At a glance

Each mode is a separate ranking; there is no combined overall or model ranking. Model names below are self-reported source metadata. Missing attribution is not inferred from a commit author.

| bot | author | recorded model | 1v1 rank | 2v2 rank | 3v3 rank |
|---|---|---|---:|---:|---:|
| `grindstone` | Opus | Opus | 1 | 5 | 6 |
| `quillback` | Fable | Fable | 2 | 1 | 2 |
| `carbon` | gemini-4-carbon-medium | gemini-4-carbon-medium | 3 | 3 | 5 |
| `astra` | gpt-6-astra | gpt-6-astra | 4 | 2 | 1 |
| `sol` | gpt-6-sol | gpt-6-sol | 5 | 4 | 3 |
| `tailwind` | Muse Spark | Muse Spark | 6 | 6 | 4 |
| `hydrogen` | gemini-4-hydrogen-medium | gemini-4-hydrogen-medium | 7 | 9 | 8 |
| `sapper` | ironyard | Not recorded | 8 | 15 | 14 |
| `angler` | ironyard | Not recorded | 9 | 7 | 12 |
| `boxer` | ironyard | Not recorded | 10 | 14 | 17 |
| `longshot` | ironyard | Not recorded | 11 | 8 | 7 |
| `bulldozer` | ironyard | Not recorded | 12 | 10 | 13 |
| `bastion` | ironyard | Not recorded | 13 | 16 | 9 |
| `wolfpack` | ironyard | Not recorded | 14 | 11 | 18 |
| `pyro` | ironyard | Not recorded | 15 | 12 | 11 |
| `thumper` | ironyard | Not recorded | 16 | 18 | 10 |
| `wasp` | ironyard | Not recorded | 17 | 13 | 15 |
| `medic` | ironyard | Not recorded | 18 | 17 | 19 |
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
| 1 | `grindstone` | Opus | 2012 | 532 | 490 | 0 | 42 | 92 |
| 2 | `quillback` | Fable | 1899 | 532 | 458 | 0 | 74 | 86 |
| 3 | `carbon` | gemini-4-carbon-medium | 1829 | 532 | 433 | 0 | 99 | 81 |
| 4 | `astra` | gpt-6-astra | 1816 | 532 | 428 | 0 | 104 | 81 |
| 5 | `sol` | gpt-6-sol | 1732 | 532 | 392 | 0 | 140 | 74 |
| 6 | `tailwind` | Muse Spark | 1619 | 532 | 335 | 0 | 197 | 63 |
| 7 | `hydrogen` | gemini-4-hydrogen-medium | 1555 | 532 | 299 | 0 | 233 | 56 |
| 8 | `sapper` | ironyard | 1495 | 532 | 263 | 0 | 269 | 49 |
| 9 | `angler` | ironyard | 1468 | 532 | 246 | 1 | 285 | 46 |
| 10 | `boxer` | ironyard | 1448 | 532 | 234 | 0 | 298 | 44 |
| 11 | `longshot` | ironyard | 1444 | 532 | 232 | 0 | 300 | 44 |
| 12 | `bulldozer` | ironyard | 1439 | 532 | 229 | 0 | 303 | 43 |
| 13 | `bastion` | ironyard | 1395 | 532 | 202 | 0 | 330 | 38 |
| 14 | `wolfpack` | ironyard | 1387 | 532 | 197 | 0 | 335 | 37 |
| 15 | `pyro` | ironyard | 1375 | 532 | 190 | 0 | 342 | 36 |
| 16 | `thumper` | ironyard | 1373 | 532 | 189 | 0 | 343 | 36 |
| 17 | `wasp` | ironyard | 1351 | 532 | 176 | 0 | 356 | 33 |
| 18 | `medic` | ironyard | 1314 | 532 | 155 | 0 | 377 | 29 |
| 19 | `hornet` | ironyard | 1253 | 532 | 123 | 0 | 409 | 23 |
| 20 | `rookie` | ironyard | 1062 | 532 | 48 | 1 | 483 | 9 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Opus | 1 | `grindstone` | 2012 | 2012 |
| Fable | 1 | `quillback` | 1899 | 1899 |
| gemini-4-carbon-medium | 1 | `carbon` | 1829 | 1829 |
| gpt-6-astra | 1 | `astra` | 1816 | 1816 |
| gpt-6-sol | 1 | `sol` | 1732 | 1732 |
| Muse Spark | 1 | `tailwind` | 1619 | 1619 |
| gemini-4-hydrogen-medium | 1 | `hydrogen` | 1555 | 1555 |
| ironyard | 13 | `sapper` | 1495 | 1370 |

## 2v2

840 of 840 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `quillback` | Fable | 1810 | 168 | 132 | 0 | 36 | 79 |
| 2 | `astra` | gpt-6-astra | 1739 | 168 | 120 | 0 | 48 | 71 |
| 3 | `carbon` | gemini-4-carbon-medium | 1692 | 168 | 101 | 0 | 67 | 60 |
| 4 | `sol` | gpt-6-sol | 1681 | 168 | 106 | 0 | 62 | 63 |
| 5 | `grindstone` | Opus | 1679 | 168 | 94 | 0 | 74 | 56 |
| 6 | `tailwind` | Muse Spark | 1648 | 168 | 95 | 0 | 73 | 56 |
| 7 | `angler` | ironyard | 1514 | 168 | 79 | 0 | 89 | 47 |
| 8 | `longshot` | ironyard | 1505 | 168 | 95 | 0 | 73 | 56 |
| 9 | `hydrogen` | gemini-4-hydrogen-medium | 1503 | 168 | 55 | 0 | 113 | 33 |
| 10 | `bulldozer` | ironyard | 1450 | 168 | 87 | 0 | 81 | 52 |
| 11 | `wolfpack` | ironyard | 1448 | 168 | 75 | 0 | 93 | 45 |
| 12 | `pyro` | ironyard | 1442 | 168 | 89 | 0 | 79 | 53 |
| 13 | `wasp` | ironyard | 1433 | 168 | 89 | 0 | 79 | 53 |
| 14 | `boxer` | ironyard | 1428 | 168 | 81 | 0 | 87 | 48 |
| 15 | `sapper` | ironyard | 1422 | 168 | 68 | 0 | 100 | 41 |
| 16 | `bastion` | ironyard | 1403 | 168 | 72 | 0 | 96 | 43 |
| 17 | `medic` | ironyard | 1358 | 168 | 75 | 0 | 93 | 45 |
| 18 | `thumper` | ironyard | 1346 | 168 | 59 | 0 | 109 | 35 |
| 19 | `hornet` | ironyard | 1312 | 168 | 63 | 0 | 105 | 38 |
| 20 | `rookie` | ironyard | 1267 | 168 | 45 | 0 | 123 | 27 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Fable | 1 | `quillback` | 1810 | 1810 |
| gpt-6-astra | 1 | `astra` | 1739 | 1739 |
| gemini-4-carbon-medium | 1 | `carbon` | 1692 | 1692 |
| gpt-6-sol | 1 | `sol` | 1681 | 1681 |
| Opus | 1 | `grindstone` | 1679 | 1679 |
| Muse Spark | 1 | `tailwind` | 1648 | 1648 |
| ironyard | 13 | `angler` | 1514 | 1410 |
| gemini-4-hydrogen-medium | 1 | `hydrogen` | 1503 | 1503 |

## 3v3

756 of 756 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `astra` | gpt-6-astra | 1819 | 204 | 132 | 0 | 72 | 65 |
| 2 | `quillback` | Fable | 1769 | 228 | 135 | 0 | 93 | 59 |
| 3 | `sol` | gpt-6-sol | 1703 | 198 | 122 | 0 | 76 | 62 |
| 4 | `tailwind` | Muse Spark | 1672 | 222 | 114 | 0 | 108 | 51 |
| 5 | `carbon` | gemini-4-carbon-medium | 1658 | 222 | 105 | 0 | 117 | 47 |
| 6 | `grindstone` | Opus | 1614 | 216 | 99 | 0 | 117 | 46 |
| 7 | `longshot` | ironyard | 1546 | 240 | 154 | 0 | 86 | 64 |
| 8 | `hydrogen` | gemini-4-hydrogen-medium | 1511 | 234 | 83 | 0 | 151 | 36 |
| 9 | `bastion` | ironyard | 1508 | 216 | 126 | 0 | 90 | 58 |
| 10 | `thumper` | ironyard | 1461 | 228 | 121 | 0 | 107 | 53 |
| 11 | `pyro` | ironyard | 1459 | 228 | 103 | 0 | 125 | 45 |
| 12 | `angler` | ironyard | 1443 | 240 | 114 | 0 | 126 | 48 |
| 13 | `bulldozer` | ironyard | 1435 | 228 | 123 | 0 | 105 | 54 |
| 14 | `sapper` | ironyard | 1429 | 228 | 108 | 0 | 120 | 47 |
| 15 | `wasp` | ironyard | 1418 | 228 | 134 | 0 | 94 | 59 |
| 16 | `hornet` | ironyard | 1379 | 234 | 130 | 0 | 104 | 56 |
| 17 | `boxer` | ironyard | 1377 | 252 | 116 | 0 | 136 | 46 |
| 18 | `wolfpack` | ironyard | 1370 | 222 | 110 | 0 | 112 | 50 |
| 19 | `medic` | ironyard | 1266 | 228 | 75 | 0 | 153 | 33 |
| 20 | `rookie` | ironyard | 1227 | 240 | 64 | 0 | 176 | 27 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| gpt-6-astra | 1 | `astra` | 1819 | 1819 |
| Fable | 1 | `quillback` | 1769 | 1769 |
| gpt-6-sol | 1 | `sol` | 1703 | 1703 |
| Muse Spark | 1 | `tailwind` | 1672 | 1672 |
| gemini-4-carbon-medium | 1 | `carbon` | 1658 | 1658 |
| Opus | 1 | `grindstone` | 1614 | 1614 |
| ironyard | 13 | `longshot` | 1546 | 1409 |
| gemini-4-hydrogen-medium | 1 | `hydrogen` | 1511 | 1511 |
