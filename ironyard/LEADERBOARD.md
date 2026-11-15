# Ironyard leaderboard

Engine 0.5.0 · 19 bots · 1200 credits per vehicle · mixed-slot-rotation-v2.

Status: **Complete**. Reproduce with `node node/cli.js ladder --write`, then `npm run build`.

## At a glance

Each mode is a separate ranking; there is no combined overall or model ranking. Model names below are self-reported source metadata. Missing attribution is not inferred from a commit author.

| bot | author | recorded model | 1v1 rank | 2v2 rank | 3v3 rank |
|---|---|---|---:|---:|---:|
| `quillback` | Tin Lantern Garage | Not recorded | 1 | 5 | 1 |
| `astra` | Astra | gpt-6-astra | 2 | 2 | 2 |
| `carbon` | Carbon | gemini-4-carbon-medium | 3 | 4 | 3 |
| `grindstone` | Rust Hollow Garage | Not recorded | 4 | 1 | 4 |
| `sol` | Sol | gpt-6-sol | 5 | 3 | 5 |
| `hydrogen` | Hydrogen | gemini-4-hydrogen-medium | 6 | 6 | 11 |
| `pyro` | ironyard | Not recorded | 7 | 10 | 7 |
| `bastion` | ironyard | Not recorded | 8 | 15 | 12 |
| `sapper` | ironyard | Not recorded | 9 | 14 | 8 |
| `bulldozer` | ironyard | Not recorded | 10 | 7 | 6 |
| `angler` | ironyard | Not recorded | 11 | 8 | 13 |
| `wolfpack` | ironyard | Not recorded | 12 | 17 | 15 |
| `longshot` | ironyard | Not recorded | 13 | 11 | 10 |
| `boxer` | ironyard | Not recorded | 14 | 16 | 14 |
| `wasp` | ironyard | Not recorded | 15 | 9 | 9 |
| `medic` | ironyard | Not recorded | 16 | 13 | 17 |
| `thumper` | ironyard | Not recorded | 17 | 12 | 16 |
| `hornet` | ironyard | Not recorded | 18 | 18 | 18 |
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
| 1 | `quillback` | Tin Lantern Garage | 2026 | 288 | 267 | 0 | 21 | 93 |
| 2 | `astra` | Astra | 1889 | 288 | 246 | 0 | 42 | 85 |
| 3 | `carbon` | Carbon | 1862 | 288 | 241 | 0 | 47 | 84 |
| 4 | `grindstone` | Rust Hollow Garage | 1799 | 288 | 228 | 0 | 60 | 79 |
| 5 | `sol` | Sol | 1711 | 288 | 207 | 0 | 81 | 72 |
| 6 | `hydrogen` | Hydrogen | 1546 | 288 | 159 | 0 | 129 | 55 |
| 7 | `pyro` | ironyard | 1543 | 288 | 158 | 0 | 130 | 55 |
| 8 | `bastion` | ironyard | 1482 | 288 | 138 | 0 | 150 | 48 |
| 9 | `sapper` | ironyard | 1461 | 288 | 131 | 0 | 157 | 46 |
| 10 | `bulldozer` | ironyard | 1458 | 288 | 130 | 0 | 158 | 45 |
| 11 | `angler` | ironyard | 1446 | 288 | 126 | 0 | 162 | 44 |
| 12 | `wolfpack` | ironyard | 1443 | 288 | 125 | 0 | 163 | 43 |
| 13 | `longshot` | ironyard | 1401 | 288 | 111 | 0 | 177 | 39 |
| 14 | `boxer` | ironyard | 1373 | 288 | 102 | 0 | 186 | 35 |
| 15 | `wasp` | ironyard | 1351 | 288 | 95 | 0 | 193 | 33 |
| 16 | `medic` | ironyard | 1342 | 288 | 92 | 0 | 196 | 32 |
| 17 | `thumper` | ironyard | 1306 | 288 | 81 | 0 | 207 | 28 |
| 18 | `hornet` | ironyard | 1235 | 288 | 61 | 0 | 227 | 21 |
| 19 | `rookie` | ironyard | 1137 | 288 | 38 | 0 | 250 | 13 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Tin Lantern Garage | 1 | `quillback` | 2026 | 2026 |
| Astra | 1 | `astra` | 1889 | 1889 |
| Carbon | 1 | `carbon` | 1862 | 1862 |
| Rust Hollow Garage | 1 | `grindstone` | 1799 | 1799 |
| Sol | 1 | `sol` | 1711 | 1711 |
| Hydrogen | 1 | `hydrogen` | 1546 | 1546 |
| ironyard | 13 | `pyro` | 1543 | 1383 |

## 2v2

640 of 640 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `grindstone` | Rust Hollow Garage | 1794 | 124 | 86 | 0 | 38 | 69 |
| 2 | `astra` | Astra | 1704 | 136 | 91 | 0 | 45 | 67 |
| 3 | `sol` | Sol | 1686 | 144 | 88 | 0 | 56 | 61 |
| 4 | `carbon` | Carbon | 1683 | 152 | 85 | 0 | 67 | 56 |
| 5 | `quillback` | Tin Lantern Garage | 1666 | 132 | 86 | 0 | 46 | 65 |
| 6 | `hydrogen` | Hydrogen | 1558 | 132 | 69 | 0 | 63 | 52 |
| 7 | `bulldozer` | ironyard | 1538 | 128 | 87 | 0 | 41 | 68 |
| 8 | `angler` | ironyard | 1508 | 136 | 71 | 0 | 65 | 52 |
| 9 | `wasp` | ironyard | 1503 | 148 | 74 | 0 | 74 | 50 |
| 10 | `pyro` | ironyard | 1470 | 132 | 68 | 0 | 64 | 52 |
| 11 | `longshot` | ironyard | 1439 | 148 | 58 | 0 | 90 | 39 |
| 12 | `thumper` | ironyard | 1431 | 132 | 65 | 0 | 67 | 49 |
| 13 | `medic` | ironyard | 1431 | 124 | 54 | 0 | 70 | 44 |
| 14 | `sapper` | ironyard | 1429 | 136 | 71 | 0 | 65 | 52 |
| 15 | `bastion` | ironyard | 1396 | 132 | 61 | 0 | 71 | 46 |
| 16 | `boxer` | ironyard | 1384 | 124 | 41 | 0 | 83 | 33 |
| 17 | `wolfpack` | ironyard | 1362 | 128 | 43 | 0 | 85 | 34 |
| 18 | `hornet` | ironyard | 1348 | 140 | 52 | 0 | 88 | 37 |
| 19 | `rookie` | ironyard | 1210 | 132 | 30 | 0 | 102 | 23 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Rust Hollow Garage | 1 | `grindstone` | 1794 | 1794 |
| Astra | 1 | `astra` | 1704 | 1704 |
| Sol | 1 | `sol` | 1686 | 1686 |
| Carbon | 1 | `carbon` | 1683 | 1683 |
| Tin Lantern Garage | 1 | `quillback` | 1666 | 1666 |
| Hydrogen | 1 | `hydrogen` | 1558 | 1558 |
| ironyard | 13 | `bulldozer` | 1538 | 1419 |

## 3v3

720 of 720 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `quillback` | Tin Lantern Garage | 1702 | 240 | 141 | 0 | 99 | 59 |
| 2 | `astra` | Astra | 1653 | 222 | 120 | 0 | 102 | 54 |
| 3 | `carbon` | Carbon | 1648 | 222 | 133 | 0 | 89 | 60 |
| 4 | `grindstone` | Rust Hollow Garage | 1596 | 222 | 110 | 0 | 112 | 50 |
| 5 | `sol` | Sol | 1565 | 216 | 97 | 0 | 119 | 45 |
| 6 | `bulldozer` | ironyard | 1548 | 228 | 135 | 0 | 93 | 59 |
| 7 | `pyro` | ironyard | 1520 | 228 | 136 | 0 | 92 | 60 |
| 8 | `sapper` | ironyard | 1509 | 222 | 130 | 0 | 92 | 59 |
| 9 | `wasp` | ironyard | 1501 | 222 | 120 | 0 | 102 | 54 |
| 10 | `longshot` | ironyard | 1500 | 228 | 119 | 0 | 109 | 52 |
| 11 | `hydrogen` | Hydrogen | 1493 | 234 | 83 | 0 | 151 | 36 |
| 12 | `bastion` | ironyard | 1491 | 234 | 122 | 0 | 112 | 52 |
| 13 | `angler` | ironyard | 1476 | 228 | 121 | 0 | 107 | 53 |
| 14 | `boxer` | ironyard | 1438 | 240 | 118 | 0 | 122 | 49 |
| 15 | `wolfpack` | ironyard | 1430 | 222 | 106 | 0 | 116 | 48 |
| 16 | `thumper` | ironyard | 1426 | 228 | 108 | 0 | 120 | 47 |
| 17 | `medic` | ironyard | 1364 | 228 | 101 | 0 | 127 | 44 |
| 18 | `hornet` | ironyard | 1359 | 228 | 90 | 0 | 138 | 40 |
| 19 | `rookie` | ironyard | 1281 | 228 | 70 | 0 | 158 | 31 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Tin Lantern Garage | 1 | `quillback` | 1702 | 1702 |
| Astra | 1 | `astra` | 1653 | 1653 |
| Carbon | 1 | `carbon` | 1648 | 1648 |
| Rust Hollow Garage | 1 | `grindstone` | 1596 | 1596 |
| Sol | 1 | `sol` | 1565 | 1565 |
| ironyard | 13 | `bulldozer` | 1548 | 1449 |
| Hydrogen | 1 | `hydrogen` | 1493 | 1493 |
