# Ironyard leaderboard

Engine 0.5.2 · 19 bots · 1200 credits per vehicle · mixed-slot-rotation-v2.

Status: **Complete**. Reproduce with `node node/cli.js ladder --write`, then `npm run build`.

## At a glance

Each mode is a separate ranking; there is no combined overall or model ranking. Model names below are self-reported source metadata. Missing attribution is not inferred from a commit author.

| bot | author | recorded model | 1v1 rank | 2v2 rank | 3v3 rank |
|---|---|---|---:|---:|---:|
| `quillback` | Tin Lantern Garage | Fable | 1 | 2 | 2 |
| `astra` | Astra | gpt-6-astra | 2 | 1 | 1 |
| `carbon` | Carbon | gemini-4-carbon-medium | 3 | 3 | 3 |
| `grindstone` | Rust Hollow Garage | Opus | 4 | 4 | 7 |
| `sol` | Sol | gpt-6-sol | 5 | 5 | 5 |
| `hydrogen` | Hydrogen | gemini-4-hydrogen-medium | 6 | 7 | 14 |
| `sapper` | ironyard | Not recorded | 7 | 10 | 8 |
| `pyro` | ironyard | Not recorded | 8 | 6 | 4 |
| `angler` | ironyard | Not recorded | 9 | 8 | 11 |
| `bulldozer` | ironyard | Not recorded | 10 | 9 | 6 |
| `bastion` | ironyard | Not recorded | 11 | 17 | 12 |
| `longshot` | ironyard | Not recorded | 12 | 15 | 9 |
| `wolfpack` | ironyard | Not recorded | 13 | 14 | 16 |
| `wasp` | ironyard | Not recorded | 14 | 11 | 13 |
| `boxer` | ironyard | Not recorded | 15 | 16 | 10 |
| `medic` | ironyard | Not recorded | 16 | 12 | 18 |
| `thumper` | ironyard | Not recorded | 17 | 13 | 15 |
| `hornet` | ironyard | Not recorded | 18 | 18 | 17 |
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
| 1 | `quillback` | Tin Lantern Garage | 1878 | 288 | 249 | 0 | 39 | 87 |
| 2 | `astra` | Astra | 1833 | 288 | 240 | 0 | 48 | 83 |
| 3 | `carbon` | Carbon | 1833 | 288 | 240 | 0 | 48 | 83 |
| 4 | `grindstone` | Rust Hollow Garage | 1829 | 288 | 239 | 0 | 49 | 83 |
| 5 | `sol` | Sol | 1674 | 288 | 200 | 0 | 88 | 69 |
| 6 | `hydrogen` | Hydrogen | 1538 | 288 | 157 | 0 | 131 | 55 |
| 7 | `sapper` | ironyard | 1512 | 288 | 148 | 0 | 140 | 51 |
| 8 | `pyro` | ironyard | 1474 | 288 | 135 | 0 | 153 | 47 |
| 9 | `angler` | ironyard | 1457 | 288 | 128 | 2 | 158 | 44 |
| 10 | `bulldozer` | ironyard | 1450 | 288 | 126 | 1 | 161 | 44 |
| 11 | `bastion` | ironyard | 1444 | 288 | 124 | 1 | 163 | 43 |
| 12 | `longshot` | ironyard | 1438 | 288 | 122 | 1 | 165 | 42 |
| 13 | `wolfpack` | ironyard | 1431 | 288 | 120 | 0 | 168 | 42 |
| 14 | `wasp` | ironyard | 1399 | 288 | 109 | 0 | 179 | 38 |
| 15 | `boxer` | ironyard | 1388 | 288 | 105 | 0 | 183 | 37 |
| 16 | `medic` | ironyard | 1348 | 288 | 92 | 0 | 196 | 32 |
| 17 | `thumper` | ironyard | 1345 | 288 | 91 | 0 | 197 | 32 |
| 18 | `hornet` | ironyard | 1270 | 288 | 68 | 0 | 220 | 24 |
| 19 | `rookie` | ironyard | 1161 | 288 | 40 | 1 | 247 | 14 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Tin Lantern Garage | 1 | `quillback` | 1878 | 1878 |
| Astra | 1 | `astra` | 1833 | 1833 |
| Carbon | 1 | `carbon` | 1833 | 1833 |
| Rust Hollow Garage | 1 | `grindstone` | 1829 | 1829 |
| Sol | 1 | `sol` | 1674 | 1674 |
| Hydrogen | 1 | `hydrogen` | 1538 | 1538 |
| ironyard | 13 | `sapper` | 1512 | 1394 |

## 2v2

640 of 640 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `astra` | Astra | 1815 | 136 | 105 | 0 | 31 | 77 |
| 2 | `quillback` | Tin Lantern Garage | 1704 | 132 | 88 | 0 | 44 | 67 |
| 3 | `carbon` | Carbon | 1702 | 152 | 87 | 0 | 65 | 57 |
| 4 | `grindstone` | Rust Hollow Garage | 1675 | 124 | 74 | 0 | 50 | 60 |
| 5 | `sol` | Sol | 1627 | 144 | 78 | 0 | 66 | 54 |
| 6 | `pyro` | ironyard | 1598 | 132 | 83 | 0 | 49 | 63 |
| 7 | `hydrogen` | Hydrogen | 1581 | 132 | 70 | 0 | 62 | 53 |
| 8 | `angler` | ironyard | 1530 | 136 | 81 | 0 | 55 | 60 |
| 9 | `bulldozer` | ironyard | 1518 | 128 | 87 | 0 | 41 | 68 |
| 10 | `sapper` | ironyard | 1468 | 136 | 74 | 0 | 62 | 54 |
| 11 | `wasp` | ironyard | 1438 | 148 | 66 | 0 | 82 | 45 |
| 12 | `medic` | ironyard | 1429 | 124 | 50 | 0 | 74 | 40 |
| 13 | `thumper` | ironyard | 1420 | 132 | 65 | 0 | 67 | 49 |
| 14 | `wolfpack` | ironyard | 1400 | 128 | 44 | 0 | 84 | 34 |
| 15 | `longshot` | ironyard | 1399 | 148 | 52 | 0 | 96 | 35 |
| 16 | `boxer` | ironyard | 1353 | 124 | 42 | 0 | 82 | 34 |
| 17 | `bastion` | ironyard | 1327 | 132 | 50 | 0 | 82 | 38 |
| 18 | `hornet` | ironyard | 1294 | 140 | 48 | 0 | 92 | 34 |
| 19 | `rookie` | ironyard | 1270 | 132 | 36 | 0 | 96 | 27 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Astra | 1 | `astra` | 1815 | 1815 |
| Tin Lantern Garage | 1 | `quillback` | 1704 | 1704 |
| Carbon | 1 | `carbon` | 1702 | 1702 |
| Rust Hollow Garage | 1 | `grindstone` | 1675 | 1675 |
| Sol | 1 | `sol` | 1627 | 1627 |
| ironyard | 13 | `pyro` | 1598 | 1419 |
| Hydrogen | 1 | `hydrogen` | 1581 | 1581 |

## 3v3

720 of 720 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `astra` | Astra | 1701 | 222 | 140 | 0 | 82 | 63 |
| 2 | `quillback` | Tin Lantern Garage | 1659 | 240 | 137 | 0 | 103 | 57 |
| 3 | `carbon` | Carbon | 1646 | 222 | 136 | 0 | 86 | 61 |
| 4 | `pyro` | ironyard | 1560 | 228 | 149 | 0 | 79 | 65 |
| 5 | `sol` | Sol | 1543 | 216 | 98 | 0 | 118 | 45 |
| 6 | `bulldozer` | ironyard | 1538 | 228 | 134 | 0 | 94 | 59 |
| 7 | `grindstone` | Rust Hollow Garage | 1538 | 222 | 94 | 0 | 128 | 42 |
| 8 | `sapper` | ironyard | 1525 | 222 | 132 | 0 | 90 | 60 |
| 9 | `longshot` | ironyard | 1497 | 228 | 113 | 0 | 115 | 50 |
| 10 | `boxer` | ironyard | 1480 | 240 | 125 | 0 | 115 | 52 |
| 11 | `angler` | ironyard | 1478 | 228 | 115 | 0 | 113 | 50 |
| 12 | `bastion` | ironyard | 1472 | 234 | 115 | 0 | 119 | 49 |
| 13 | `wasp` | ironyard | 1471 | 222 | 105 | 0 | 117 | 47 |
| 14 | `hydrogen` | Hydrogen | 1464 | 234 | 77 | 0 | 157 | 33 |
| 15 | `thumper` | ironyard | 1422 | 228 | 109 | 0 | 119 | 48 |
| 16 | `wolfpack` | ironyard | 1412 | 222 | 102 | 0 | 120 | 46 |
| 17 | `hornet` | ironyard | 1400 | 228 | 100 | 0 | 128 | 44 |
| 18 | `medic` | ironyard | 1379 | 228 | 97 | 0 | 131 | 43 |
| 19 | `rookie` | ironyard | 1329 | 228 | 82 | 0 | 146 | 36 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Astra | 1 | `astra` | 1701 | 1701 |
| Tin Lantern Garage | 1 | `quillback` | 1659 | 1659 |
| Carbon | 1 | `carbon` | 1646 | 1646 |
| ironyard | 13 | `pyro` | 1560 | 1459 |
| Sol | 1 | `sol` | 1543 | 1543 |
| Rust Hollow Garage | 1 | `grindstone` | 1538 | 1538 |
| Hydrogen | 1 | `hydrogen` | 1464 | 1464 |
