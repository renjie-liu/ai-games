# Ironyard leaderboard

Engine 0.5.1 · 19 bots · 1200 credits per vehicle · mixed-slot-rotation-v2.

Status: **Complete**. Reproduce with `node node/cli.js ladder --write`, then `npm run build`.

## At a glance

Each mode is a separate ranking; there is no combined overall or model ranking. Model names below are self-reported source metadata. Missing attribution is not inferred from a commit author.

| bot | author | recorded model | 1v1 rank | 2v2 rank | 3v3 rank |
|---|---|---|---:|---:|---:|
| `quillback` | Tin Lantern Garage | Fable | 1 | 5 | 1 |
| `grindstone` | Rust Hollow Garage | Opus | 2 | 3 | 8 |
| `carbon` | Carbon | gemini-4-carbon-medium | 3 | 2 | 3 |
| `astra` | Astra | gpt-6-astra | 4 | 1 | 2 |
| `sol` | Sol | gpt-6-sol | 5 | 4 | 4 |
| `hydrogen` | Hydrogen | gemini-4-hydrogen-medium | 6 | 6 | 7 |
| `bastion` | ironyard | Not recorded | 7 | 14 | 13 |
| `sapper` | ironyard | Not recorded | 8 | 12 | 10 |
| `pyro` | ironyard | Not recorded | 9 | 9 | 5 |
| `wolfpack` | ironyard | Not recorded | 10 | 16 | 15 |
| `bulldozer` | ironyard | Not recorded | 11 | 8 | 6 |
| `angler` | ironyard | Not recorded | 12 | 7 | 12 |
| `longshot` | ironyard | Not recorded | 13 | 15 | 11 |
| `boxer` | ironyard | Not recorded | 14 | 18 | 16 |
| `wasp` | ironyard | Not recorded | 15 | 10 | 9 |
| `medic` | ironyard | Not recorded | 16 | 13 | 17 |
| `thumper` | ironyard | Not recorded | 17 | 11 | 14 |
| `hornet` | ironyard | Not recorded | 18 | 17 | 18 |
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
| 1 | `quillback` | Tin Lantern Garage | 1918 | 288 | 253 | 0 | 35 | 88 |
| 2 | `grindstone` | Rust Hollow Garage | 1895 | 288 | 249 | 0 | 39 | 87 |
| 3 | `carbon` | Carbon | 1874 | 288 | 245 | 0 | 43 | 85 |
| 4 | `astra` | Astra | 1838 | 288 | 238 | 0 | 50 | 83 |
| 5 | `sol` | Sol | 1652 | 288 | 192 | 0 | 96 | 67 |
| 6 | `hydrogen` | Hydrogen | 1558 | 288 | 163 | 0 | 125 | 57 |
| 7 | `bastion` | ironyard | 1491 | 288 | 141 | 0 | 147 | 49 |
| 8 | `sapper` | ironyard | 1479 | 288 | 137 | 0 | 151 | 48 |
| 9 | `pyro` | ironyard | 1476 | 288 | 136 | 0 | 152 | 47 |
| 10 | `wolfpack` | ironyard | 1473 | 288 | 135 | 0 | 153 | 47 |
| 11 | `bulldozer` | ironyard | 1464 | 288 | 132 | 0 | 156 | 46 |
| 12 | `angler` | ironyard | 1453 | 288 | 128 | 0 | 160 | 44 |
| 13 | `longshot` | ironyard | 1405 | 288 | 112 | 0 | 176 | 39 |
| 14 | `boxer` | ironyard | 1375 | 288 | 102 | 0 | 186 | 35 |
| 15 | `wasp` | ironyard | 1357 | 288 | 96 | 0 | 192 | 33 |
| 16 | `medic` | ironyard | 1350 | 288 | 94 | 0 | 194 | 33 |
| 17 | `thumper` | ironyard | 1319 | 288 | 84 | 0 | 204 | 29 |
| 18 | `hornet` | ironyard | 1242 | 288 | 62 | 0 | 226 | 22 |
| 19 | `rookie` | ironyard | 1135 | 288 | 37 | 0 | 251 | 13 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Tin Lantern Garage | 1 | `quillback` | 1918 | 1918 |
| Rust Hollow Garage | 1 | `grindstone` | 1895 | 1895 |
| Carbon | 1 | `carbon` | 1874 | 1874 |
| Astra | 1 | `astra` | 1838 | 1838 |
| Sol | 1 | `sol` | 1652 | 1652 |
| Hydrogen | 1 | `hydrogen` | 1558 | 1558 |
| ironyard | 13 | `bastion` | 1491 | 1386 |

## 2v2

640 of 640 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `astra` | Astra | 1709 | 136 | 93 | 0 | 43 | 68 |
| 2 | `carbon` | Carbon | 1704 | 152 | 94 | 0 | 58 | 62 |
| 3 | `grindstone` | Rust Hollow Garage | 1674 | 124 | 74 | 0 | 50 | 60 |
| 4 | `sol` | Sol | 1639 | 144 | 83 | 0 | 61 | 58 |
| 5 | `quillback` | Tin Lantern Garage | 1623 | 132 | 81 | 0 | 51 | 61 |
| 6 | `hydrogen` | Hydrogen | 1562 | 132 | 70 | 0 | 62 | 53 |
| 7 | `angler` | ironyard | 1539 | 136 | 78 | 0 | 58 | 57 |
| 8 | `bulldozer` | ironyard | 1532 | 128 | 87 | 0 | 41 | 68 |
| 9 | `pyro` | ironyard | 1511 | 132 | 73 | 0 | 59 | 55 |
| 10 | `wasp` | ironyard | 1466 | 148 | 68 | 0 | 80 | 46 |
| 11 | `thumper` | ironyard | 1446 | 132 | 66 | 0 | 66 | 50 |
| 12 | `sapper` | ironyard | 1445 | 136 | 69 | 0 | 67 | 51 |
| 13 | `medic` | ironyard | 1438 | 124 | 53 | 0 | 71 | 43 |
| 14 | `bastion` | ironyard | 1425 | 132 | 62 | 0 | 70 | 47 |
| 15 | `longshot` | ironyard | 1424 | 148 | 58 | 0 | 90 | 39 |
| 16 | `wolfpack` | ironyard | 1399 | 128 | 45 | 0 | 83 | 35 |
| 17 | `hornet` | ironyard | 1350 | 140 | 53 | 0 | 87 | 38 |
| 18 | `boxer` | ironyard | 1346 | 124 | 37 | 0 | 87 | 30 |
| 19 | `rookie` | ironyard | 1291 | 132 | 36 | 0 | 96 | 27 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Astra | 1 | `astra` | 1709 | 1709 |
| Carbon | 1 | `carbon` | 1704 | 1704 |
| Rust Hollow Garage | 1 | `grindstone` | 1674 | 1674 |
| Sol | 1 | `sol` | 1639 | 1639 |
| Tin Lantern Garage | 1 | `quillback` | 1623 | 1623 |
| Hydrogen | 1 | `hydrogen` | 1562 | 1562 |
| ironyard | 13 | `angler` | 1539 | 1432 |

## 3v3

720 of 720 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `quillback` | Tin Lantern Garage | 1699 | 240 | 138 | 0 | 102 | 57 |
| 2 | `astra` | Astra | 1698 | 222 | 135 | 0 | 87 | 61 |
| 3 | `carbon` | Carbon | 1661 | 222 | 132 | 0 | 90 | 60 |
| 4 | `sol` | Sol | 1566 | 216 | 97 | 0 | 119 | 45 |
| 5 | `pyro` | ironyard | 1547 | 228 | 144 | 0 | 84 | 63 |
| 6 | `bulldozer` | ironyard | 1545 | 228 | 138 | 0 | 90 | 61 |
| 7 | `hydrogen` | Hydrogen | 1536 | 234 | 96 | 0 | 138 | 41 |
| 8 | `grindstone` | Rust Hollow Garage | 1532 | 222 | 88 | 0 | 134 | 40 |
| 9 | `wasp` | ironyard | 1522 | 222 | 124 | 0 | 98 | 56 |
| 10 | `sapper` | ironyard | 1514 | 222 | 128 | 0 | 94 | 58 |
| 11 | `longshot` | ironyard | 1505 | 228 | 122 | 0 | 106 | 54 |
| 12 | `angler` | ironyard | 1455 | 228 | 113 | 0 | 115 | 50 |
| 13 | `bastion` | ironyard | 1455 | 234 | 111 | 0 | 123 | 47 |
| 14 | `thumper` | ironyard | 1417 | 228 | 109 | 0 | 119 | 48 |
| 15 | `wolfpack` | ironyard | 1413 | 222 | 105 | 0 | 117 | 47 |
| 16 | `boxer` | ironyard | 1398 | 240 | 105 | 0 | 135 | 44 |
| 17 | `medic` | ironyard | 1382 | 228 | 102 | 0 | 126 | 45 |
| 18 | `hornet` | ironyard | 1366 | 228 | 95 | 0 | 133 | 42 |
| 19 | `rookie` | ironyard | 1303 | 228 | 78 | 0 | 150 | 34 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Tin Lantern Garage | 1 | `quillback` | 1699 | 1699 |
| Astra | 1 | `astra` | 1698 | 1698 |
| Carbon | 1 | `carbon` | 1661 | 1661 |
| Sol | 1 | `sol` | 1566 | 1566 |
| ironyard | 13 | `pyro` | 1547 | 1448 |
| Hydrogen | 1 | `hydrogen` | 1536 | 1536 |
| Rust Hollow Garage | 1 | `grindstone` | 1532 | 1532 |
