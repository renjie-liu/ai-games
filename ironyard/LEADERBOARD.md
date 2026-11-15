# Ironyard leaderboard

Engine 0.5.0 · 17 bots · 1200 credits per vehicle · mixed-slot-rotation-v2.

Status: **Complete**. Reproduce with `node node/cli.js ladder --write`, then `npm run build`.

## At a glance

Each mode is a separate ranking; there is no combined overall or model ranking. Model names below are self-reported source metadata. Missing attribution is not inferred from a commit author.

| bot | author | recorded model | 1v1 rank | 2v2 rank | 3v3 rank |
|---|---|---|---:|---:|---:|
| `quillback` | Tin Lantern Garage | Not recorded | 1 | 2 | 2 |
| `astra` | Astra | gpt-6-astra | 2 | 1 | 1 |
| `grindstone` | Rust Hollow Garage | Not recorded | 3 | 3 | 3 |
| `sol` | Sol | gpt-6-sol | 4 | 4 | 4 |
| `pyro` | ironyard | Not recorded | 5 | 7 | 6 |
| `bastion` | ironyard | Not recorded | 6 | 5 | 8 |
| `sapper` | ironyard | Not recorded | 7 | 6 | 9 |
| `wolfpack` | ironyard | Not recorded | 8 | 14 | 16 |
| `bulldozer` | ironyard | Not recorded | 9 | 8 | 10 |
| `angler` | ironyard | Not recorded | 10 | 12 | 5 |
| `longshot` | ironyard | Not recorded | 11 | 11 | 11 |
| `boxer` | ironyard | Not recorded | 12 | 9 | 13 |
| `wasp` | ironyard | Not recorded | 13 | 10 | 7 |
| `medic` | ironyard | Not recorded | 14 | 15 | 17 |
| `thumper` | ironyard | Not recorded | 15 | 13 | 12 |
| `hornet` | ironyard | Not recorded | 16 | 16 | 14 |
| `rookie` | ironyard | Not recorded | 17 | 17 | 15 |

## How to read the rankings

- **1v1:** every pair plays all eight maps from both spawn sides, with seed 1.
- **2v2 / 3v3:** 40 deterministic mixed-team rounds, balanced across authors where possible. Each pairing rotates through every team slot, from both spawn sides. Some entrants sit out each round, so game counts and map exposure differ.
- **Rating:** a joint logistic fit to all results, with a 1500 anchor equivalent to two draws. Team strength is the sum of individual ratings above 1500. Wins count 1, draws 0.5, losses 0. Opponent and teammate strength matter; raw win rate does not determine rank.
- **Ordering:** unrounded rating, then win rate, then bot id. Displayed ratings are rounded. Bots with zero games are unranked. Author tables sort by the author’s best bot, then mean rating.
- **Scope:** these are fixed-season results, not confidence intervals or a general model benchmark. Team synergy is approximated as additive. Close scores and small samples warrant more seeds/rounds.
- **Custom tournaments:** the browser’s round robin uses 3 points per win, 1 per draw and hull difference as a tie-break. One bot fills its entire team; those results do not update this mixed-team ladder.

See [ranking methodology and audit](docs/RANKING.md) for details, error handling and limitations.

## 1v1

2176 of 2176 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `quillback` | Tin Lantern Garage | 1998 | 256 | 237 | 0 | 19 | 93 |
| 2 | `astra` | Astra | 1902 | 256 | 224 | 0 | 32 | 88 |
| 3 | `grindstone` | Rust Hollow Garage | 1789 | 256 | 204 | 0 | 52 | 80 |
| 4 | `sol` | Sol | 1707 | 256 | 186 | 0 | 70 | 73 |
| 5 | `pyro` | ironyard | 1552 | 256 | 144 | 0 | 112 | 56 |
| 6 | `bastion` | ironyard | 1510 | 256 | 131 | 0 | 125 | 51 |
| 7 | `sapper` | ironyard | 1490 | 256 | 125 | 0 | 131 | 49 |
| 8 | `wolfpack` | ironyard | 1484 | 256 | 123 | 0 | 133 | 48 |
| 9 | `bulldozer` | ironyard | 1481 | 256 | 122 | 0 | 134 | 48 |
| 10 | `angler` | ironyard | 1474 | 256 | 120 | 0 | 136 | 47 |
| 11 | `longshot` | ironyard | 1429 | 256 | 106 | 0 | 150 | 41 |
| 12 | `boxer` | ironyard | 1400 | 256 | 97 | 0 | 159 | 38 |
| 13 | `wasp` | ironyard | 1381 | 256 | 91 | 0 | 165 | 36 |
| 14 | `medic` | ironyard | 1374 | 256 | 89 | 0 | 167 | 35 |
| 15 | `thumper` | ironyard | 1343 | 256 | 80 | 0 | 176 | 31 |
| 16 | `hornet` | ironyard | 1266 | 256 | 59 | 0 | 197 | 23 |
| 17 | `rookie` | ironyard | 1174 | 256 | 38 | 0 | 218 | 15 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Tin Lantern Garage | 1 | `quillback` | 1998 | 1998 |
| Astra | 1 | `astra` | 1902 | 1902 |
| Rust Hollow Garage | 1 | `grindstone` | 1789 | 1789 |
| Sol | 1 | `sol` | 1707 | 1707 |
| ironyard | 13 | `pyro` | 1552 | 1412 |

## 2v2

640 of 640 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `astra` | Astra | 1878 | 152 | 128 | 0 | 24 | 84 |
| 2 | `quillback` | Tin Lantern Garage | 1814 | 148 | 116 | 0 | 32 | 78 |
| 3 | `grindstone` | Rust Hollow Garage | 1757 | 140 | 89 | 0 | 51 | 64 |
| 4 | `sol` | Sol | 1607 | 156 | 100 | 0 | 56 | 64 |
| 5 | `bastion` | ironyard | 1571 | 148 | 90 | 0 | 58 | 61 |
| 6 | `sapper` | ironyard | 1527 | 156 | 86 | 0 | 70 | 55 |
| 7 | `pyro` | ironyard | 1522 | 156 | 86 | 0 | 70 | 55 |
| 8 | `bulldozer` | ironyard | 1489 | 136 | 78 | 0 | 58 | 57 |
| 9 | `boxer` | ironyard | 1480 | 144 | 55 | 0 | 89 | 38 |
| 10 | `wasp` | ironyard | 1456 | 156 | 69 | 0 | 87 | 44 |
| 11 | `longshot` | ironyard | 1456 | 156 | 67 | 0 | 89 | 43 |
| 12 | `angler` | ironyard | 1422 | 148 | 64 | 0 | 84 | 43 |
| 13 | `thumper` | ironyard | 1376 | 152 | 58 | 0 | 94 | 38 |
| 14 | `wolfpack` | ironyard | 1370 | 160 | 52 | 0 | 108 | 33 |
| 15 | `medic` | ironyard | 1341 | 144 | 51 | 0 | 93 | 35 |
| 16 | `hornet` | ironyard | 1312 | 152 | 50 | 0 | 102 | 33 |
| 17 | `rookie` | ironyard | 1261 | 156 | 41 | 0 | 115 | 26 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Astra | 1 | `astra` | 1878 | 1878 |
| Tin Lantern Garage | 1 | `quillback` | 1814 | 1814 |
| Rust Hollow Garage | 1 | `grindstone` | 1757 | 1757 |
| Sol | 1 | `sol` | 1607 | 1607 |
| ironyard | 13 | `bastion` | 1571 | 1429 |

## 3v3

480 of 480 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `astra` | Astra | 1790 | 162 | 125 | 0 | 37 | 77 |
| 2 | `quillback` | Tin Lantern Garage | 1641 | 162 | 86 | 0 | 76 | 53 |
| 3 | `grindstone` | Rust Hollow Garage | 1641 | 138 | 77 | 0 | 61 | 56 |
| 4 | `sol` | Sol | 1611 | 162 | 76 | 0 | 86 | 47 |
| 5 | `angler` | ironyard | 1531 | 192 | 111 | 0 | 81 | 58 |
| 6 | `pyro` | ironyard | 1527 | 174 | 93 | 0 | 81 | 53 |
| 7 | `wasp` | ironyard | 1510 | 186 | 116 | 0 | 70 | 62 |
| 8 | `bastion` | ironyard | 1500 | 138 | 72 | 0 | 66 | 52 |
| 9 | `sapper` | ironyard | 1496 | 180 | 109 | 0 | 71 | 61 |
| 10 | `bulldozer` | ironyard | 1492 | 162 | 89 | 0 | 73 | 55 |
| 11 | `longshot` | ironyard | 1471 | 204 | 103 | 0 | 101 | 51 |
| 12 | `thumper` | ironyard | 1462 | 174 | 80 | 0 | 94 | 46 |
| 13 | `boxer` | ironyard | 1422 | 174 | 64 | 0 | 110 | 37 |
| 14 | `hornet` | ironyard | 1417 | 186 | 75 | 0 | 111 | 40 |
| 15 | `rookie` | ironyard | 1355 | 180 | 66 | 0 | 114 | 37 |
| 16 | `wolfpack` | ironyard | 1336 | 156 | 44 | 0 | 112 | 28 |
| 17 | `medic` | ironyard | 1334 | 150 | 54 | 0 | 96 | 36 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Astra | 1 | `astra` | 1790 | 1790 |
| Rust Hollow Garage | 1 | `grindstone` | 1641 | 1641 |
| Tin Lantern Garage | 1 | `quillback` | 1641 | 1641 |
| Sol | 1 | `sol` | 1611 | 1611 |
| ironyard | 13 | `angler` | 1531 | 1450 |
