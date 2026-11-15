# Ironyard leaderboard

Engine 0.5.0 · 19 bots · 1200 credits per vehicle · mixed-slot-rotation-v2.

Status: **Complete**. Reproduce with `node node/cli.js ladder --write`, then `npm run build`.

## At a glance

Each mode is a separate ranking; there is no combined overall or model ranking. Model names below are self-reported source metadata. Missing attribution is not inferred from a commit author.

| bot | author | recorded model | 1v1 rank | 2v2 rank | 3v3 rank |
|---|---|---|---:|---:|---:|
| `quillback` | Tin Lantern Garage | Fable | 1 | 5 | 1 |
| `grindstone` | Rust Hollow Garage | Opus | 2 | 2 | 6 |
| `carbon` | Carbon | gemini-4-carbon-medium | 3 | 3 | 3 |
| `astra` | Astra | gpt-6-astra | 4 | 1 | 2 |
| `sol` | Sol | gpt-6-sol | 5 | 4 | 4 |
| `hydrogen` | Hydrogen | gemini-4-hydrogen-medium | 6 | 6 | 7 |
| `pyro` | ironyard | Not recorded | 7 | 9 | 8 |
| `bastion` | ironyard | Not recorded | 8 | 15 | 12 |
| `bulldozer` | ironyard | Not recorded | 9 | 7 | 5 |
| `sapper` | ironyard | Not recorded | 10 | 14 | 9 |
| `angler` | ironyard | Not recorded | 11 | 8 | 13 |
| `wolfpack` | ironyard | Not recorded | 12 | 16 | 14 |
| `longshot` | ironyard | Not recorded | 13 | 13 | 11 |
| `boxer` | ironyard | Not recorded | 14 | 18 | 16 |
| `wasp` | ironyard | Not recorded | 15 | 10 | 10 |
| `medic` | ironyard | Not recorded | 16 | 12 | 18 |
| `thumper` | ironyard | Not recorded | 17 | 11 | 15 |
| `hornet` | ironyard | Not recorded | 18 | 17 | 17 |
| `rookie` | ironyard | Not recorded | 19 | 19 | 19 |

## How to read the rankings

- **1v1:** every pair plays all eight maps from both spawn sides, with seed 1.
- **2v2 / 3v3:** 40 deterministic mixed-team rounds, balanced across authors where possible. Each pairing rotates through every team slot, from both spawn sides. Some entrants sit out each round, so game counts and map exposure differ.
- **Rating:** a joint logistic fit to all results, with a 1500 anchor equivalent to two draws. Team strength is the sum of individual ratings above 1500. Wins count 1, draws 0.5, losses 0. Opponent and teammate strength matter; raw win rate does not determine rank.
- **Ordering:** unrounded rating, then win rate, then bot id. Displayed ratings are rounded. Bots with zero games are unranked. Author tables sort by the author’s best bot, then mean rating.
- **Scope:** these are fixed-season results, not confidence intervals or a general model benchmark. Team synergy is approximated as additive. Close scores and small samples warrant more seeds/rounds.
- **Custom tournaments:** the browser’s round robin uses 3 points per win, 1 per draw and hull difference as a tie-break. One bot fills its entire team; those results do not update this mixed-team ladder.

See [ranking methodology and audit](docs/RANKING.md) for details, error handling and limitations.

## 1v1

2736 of 2736 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `quillback` | Tin Lantern Garage | 1916 | 288 | 253 | 0 | 35 | 88 |
| 2 | `grindstone` | Rust Hollow Garage | 1894 | 288 | 249 | 0 | 39 | 87 |
| 3 | `carbon` | Carbon | 1872 | 288 | 245 | 0 | 43 | 85 |
| 4 | `astra` | Astra | 1823 | 288 | 235 | 0 | 53 | 82 |
| 5 | `sol` | Sol | 1652 | 288 | 192 | 0 | 96 | 67 |
| 6 | `hydrogen` | Hydrogen | 1548 | 288 | 160 | 0 | 128 | 56 |
| 7 | `pyro` | ironyard | 1548 | 288 | 160 | 0 | 128 | 56 |
| 8 | `bastion` | ironyard | 1485 | 288 | 139 | 0 | 149 | 48 |
| 9 | `bulldozer` | ironyard | 1467 | 288 | 133 | 0 | 155 | 46 |
| 10 | `sapper` | ironyard | 1467 | 288 | 133 | 0 | 155 | 46 |
| 11 | `angler` | ironyard | 1453 | 288 | 128 | 0 | 160 | 44 |
| 12 | `wolfpack` | ironyard | 1447 | 288 | 126 | 0 | 162 | 44 |
| 13 | `longshot` | ironyard | 1405 | 288 | 112 | 0 | 176 | 39 |
| 14 | `boxer` | ironyard | 1375 | 288 | 102 | 0 | 186 | 35 |
| 15 | `wasp` | ironyard | 1353 | 288 | 95 | 0 | 193 | 33 |
| 16 | `medic` | ironyard | 1347 | 288 | 93 | 0 | 195 | 32 |
| 17 | `thumper` | ironyard | 1312 | 288 | 82 | 0 | 206 | 28 |
| 18 | `hornet` | ironyard | 1238 | 288 | 61 | 0 | 227 | 21 |
| 19 | `rookie` | ironyard | 1139 | 288 | 38 | 0 | 250 | 13 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Tin Lantern Garage | 1 | `quillback` | 1916 | 1916 |
| Rust Hollow Garage | 1 | `grindstone` | 1894 | 1894 |
| Carbon | 1 | `carbon` | 1872 | 1872 |
| Astra | 1 | `astra` | 1823 | 1823 |
| Sol | 1 | `sol` | 1652 | 1652 |
| Hydrogen | 1 | `hydrogen` | 1548 | 1548 |
| ironyard | 13 | `pyro` | 1548 | 1387 |

## 2v2

640 of 640 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `astra` | Astra | 1696 | 136 | 92 | 0 | 44 | 68 |
| 2 | `grindstone` | Rust Hollow Garage | 1675 | 124 | 74 | 0 | 50 | 60 |
| 3 | `carbon` | Carbon | 1669 | 152 | 89 | 0 | 63 | 59 |
| 4 | `sol` | Sol | 1648 | 144 | 85 | 0 | 59 | 59 |
| 5 | `quillback` | Tin Lantern Garage | 1643 | 132 | 85 | 0 | 47 | 64 |
| 6 | `hydrogen` | Hydrogen | 1559 | 132 | 69 | 0 | 63 | 52 |
| 7 | `bulldozer` | ironyard | 1555 | 128 | 90 | 0 | 38 | 70 |
| 8 | `angler` | ironyard | 1540 | 136 | 79 | 0 | 57 | 58 |
| 9 | `pyro` | ironyard | 1494 | 132 | 70 | 0 | 62 | 53 |
| 10 | `wasp` | ironyard | 1461 | 148 | 67 | 0 | 81 | 45 |
| 11 | `thumper` | ironyard | 1449 | 132 | 66 | 0 | 66 | 50 |
| 12 | `medic` | ironyard | 1438 | 124 | 54 | 0 | 70 | 44 |
| 13 | `longshot` | ironyard | 1434 | 148 | 59 | 0 | 89 | 40 |
| 14 | `sapper` | ironyard | 1433 | 136 | 68 | 0 | 68 | 50 |
| 15 | `bastion` | ironyard | 1416 | 132 | 61 | 0 | 71 | 46 |
| 16 | `wolfpack` | ironyard | 1400 | 128 | 45 | 0 | 83 | 35 |
| 17 | `hornet` | ironyard | 1364 | 140 | 54 | 0 | 86 | 39 |
| 18 | `boxer` | ironyard | 1348 | 124 | 37 | 0 | 87 | 30 |
| 19 | `rookie` | ironyard | 1296 | 132 | 36 | 0 | 96 | 27 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Astra | 1 | `astra` | 1696 | 1696 |
| Rust Hollow Garage | 1 | `grindstone` | 1675 | 1675 |
| Carbon | 1 | `carbon` | 1669 | 1669 |
| Sol | 1 | `sol` | 1648 | 1648 |
| Tin Lantern Garage | 1 | `quillback` | 1643 | 1643 |
| Hydrogen | 1 | `hydrogen` | 1559 | 1559 |
| ironyard | 13 | `bulldozer` | 1555 | 1433 |

## 3v3

720 of 720 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `quillback` | Tin Lantern Garage | 1707 | 240 | 142 | 0 | 98 | 59 |
| 2 | `astra` | Astra | 1670 | 222 | 127 | 0 | 95 | 57 |
| 3 | `carbon` | Carbon | 1665 | 222 | 134 | 0 | 88 | 60 |
| 4 | `sol` | Sol | 1591 | 216 | 105 | 0 | 111 | 49 |
| 5 | `bulldozer` | ironyard | 1549 | 228 | 138 | 0 | 90 | 61 |
| 6 | `grindstone` | Rust Hollow Garage | 1538 | 222 | 88 | 0 | 134 | 40 |
| 7 | `hydrogen` | Hydrogen | 1530 | 234 | 91 | 0 | 143 | 39 |
| 8 | `pyro` | ironyard | 1528 | 228 | 140 | 0 | 88 | 61 |
| 9 | `sapper` | ironyard | 1518 | 222 | 131 | 0 | 91 | 59 |
| 10 | `wasp` | ironyard | 1506 | 222 | 120 | 0 | 102 | 54 |
| 11 | `longshot` | ironyard | 1488 | 228 | 118 | 0 | 110 | 52 |
| 12 | `bastion` | ironyard | 1466 | 234 | 112 | 0 | 122 | 48 |
| 13 | `angler` | ironyard | 1439 | 228 | 109 | 0 | 119 | 48 |
| 14 | `wolfpack` | ironyard | 1438 | 222 | 109 | 0 | 113 | 49 |
| 15 | `thumper` | ironyard | 1435 | 228 | 114 | 0 | 114 | 50 |
| 16 | `boxer` | ironyard | 1409 | 240 | 111 | 0 | 129 | 46 |
| 17 | `hornet` | ironyard | 1372 | 228 | 96 | 0 | 132 | 42 |
| 18 | `medic` | ironyard | 1367 | 228 | 99 | 0 | 129 | 43 |
| 19 | `rookie` | ironyard | 1293 | 228 | 76 | 0 | 152 | 33 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Tin Lantern Garage | 1 | `quillback` | 1707 | 1707 |
| Astra | 1 | `astra` | 1670 | 1670 |
| Carbon | 1 | `carbon` | 1665 | 1665 |
| Sol | 1 | `sol` | 1591 | 1591 |
| ironyard | 13 | `bulldozer` | 1549 | 1447 |
| Rust Hollow Garage | 1 | `grindstone` | 1538 | 1538 |
| Hydrogen | 1 | `hydrogen` | 1530 | 1530 |
