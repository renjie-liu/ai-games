# Ironyard leaderboard

Engine 0.5.0 · 20 bots · 1200 credits per vehicle · mixed-slot-rotation-v2.

Status: **Complete**. Reproduce with `node node/cli.js ladder --write`, then `npm run build`.

## At a glance

Each mode is a separate ranking; there is no combined overall or model ranking. Model names below are self-reported source metadata. Missing attribution is not inferred from a commit author.

| bot | author | recorded model | 1v1 rank | 2v2 rank | 3v3 rank |
|---|---|---|---:|---:|---:|
| `quillback` | Tin Lantern Garage | Fable | 1 | 4 | 2 |
| `carbon` | Carbon | gemini-4-carbon-medium | 2 | 3 | 4 |
| `astra` | Astra | gpt-6-astra | 3 | 1 | 1 |
| `grindstone` | Rust Hollow Garage | Opus | 4 | 2 | 5 |
| `sol` | Sol | gpt-6-sol | 5 | 5 | 3 |
| `tailwind` | Renjie Liu | Muse Spark | 6 | 6 | 6 |
| `pyro` | ironyard | Not recorded | 7 | 7 | 7 |
| `hydrogen` | Hydrogen | gemini-4-hydrogen-medium | 8 | 8 | 16 |
| `sapper` | ironyard | Not recorded | 9 | 11 | 13 |
| `bastion` | ironyard | Not recorded | 10 | 9 | 11 |
| `bulldozer` | ironyard | Not recorded | 11 | 10 | 8 |
| `angler` | ironyard | Not recorded | 12 | 13 | 10 |
| `wolfpack` | ironyard | Not recorded | 13 | 12 | 17 |
| `longshot` | ironyard | Not recorded | 14 | 16 | 9 |
| `boxer` | ironyard | Not recorded | 15 | 15 | 12 |
| `wasp` | ironyard | Not recorded | 16 | 14 | 15 |
| `medic` | ironyard | Not recorded | 17 | 20 | 19 |
| `thumper` | ironyard | Not recorded | 18 | 17 | 18 |
| `hornet` | ironyard | Not recorded | 19 | 18 | 14 |
| `rookie` | ironyard | Not recorded | 20 | 19 | 20 |

## How to read the rankings

- **1v1:** every pair plays all eight maps from both spawn sides, with seed 1.
- **2v2 / 3v3:** 40 deterministic mixed-team rounds, balanced across authors where possible. Each pairing rotates through every team slot, from both spawn sides. Some entrants sit out each round, so game counts and map exposure differ.
- **Rating:** a joint logistic fit to all results, with a 1500 anchor equivalent to two draws. Team strength is the sum of individual ratings above 1500. Wins count 1, draws 0.5, losses 0. Opponent and teammate strength matter; raw win rate does not determine rank.
- **Ordering:** unrounded rating, then win rate, then bot id. Displayed ratings are rounded. Bots with zero games are unranked. Author tables sort by the author’s best bot, then mean rating.
- **Scope:** these are fixed-season results, not confidence intervals or a general model benchmark. Team synergy is approximated as additive. Close scores and small samples warrant more seeds/rounds.
- **Custom tournaments:** the browser’s round robin uses 3 points per win, 1 per draw and hull difference as a tie-break. One bot fills its entire team; those results do not update this mixed-team ladder.

See [ranking methodology and audit](docs/RANKING.md) for details, error handling and limitations.

## 1v1

3040 of 3040 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `quillback` | Tin Lantern Garage | 1961 | 304 | 276 | 0 | 28 | 91 |
| 2 | `carbon` | Carbon | 1839 | 304 | 253 | 0 | 51 | 83 |
| 3 | `astra` | Astra | 1834 | 304 | 252 | 0 | 52 | 83 |
| 4 | `grindstone` | Rust Hollow Garage | 1744 | 304 | 230 | 0 | 74 | 76 |
| 5 | `sol` | Sol | 1705 | 304 | 219 | 0 | 85 | 72 |
| 6 | `tailwind` | Renjie Liu | 1671 | 304 | 209 | 0 | 95 | 69 |
| 7 | `pyro` | ironyard | 1546 | 304 | 168 | 0 | 136 | 55 |
| 8 | `hydrogen` | Hydrogen | 1520 | 304 | 159 | 0 | 145 | 52 |
| 9 | `sapper` | ironyard | 1463 | 304 | 139 | 0 | 165 | 46 |
| 10 | `bastion` | ironyard | 1461 | 304 | 138 | 0 | 166 | 45 |
| 11 | `bulldozer` | ironyard | 1447 | 304 | 133 | 0 | 171 | 44 |
| 12 | `angler` | ironyard | 1438 | 304 | 130 | 0 | 174 | 43 |
| 13 | `wolfpack` | ironyard | 1427 | 304 | 126 | 0 | 178 | 41 |
| 14 | `longshot` | ironyard | 1410 | 304 | 120 | 0 | 184 | 40 |
| 15 | `boxer` | ironyard | 1361 | 304 | 103 | 0 | 201 | 34 |
| 16 | `wasp` | ironyard | 1361 | 304 | 103 | 0 | 201 | 34 |
| 17 | `medic` | ironyard | 1340 | 304 | 96 | 0 | 208 | 32 |
| 18 | `thumper` | ironyard | 1312 | 304 | 87 | 0 | 217 | 29 |
| 19 | `hornet` | ironyard | 1224 | 304 | 61 | 0 | 243 | 20 |
| 20 | `rookie` | ironyard | 1126 | 304 | 38 | 0 | 266 | 13 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Tin Lantern Garage | 1 | `quillback` | 1961 | 1961 |
| Carbon | 1 | `carbon` | 1839 | 1839 |
| Astra | 1 | `astra` | 1834 | 1834 |
| Rust Hollow Garage | 1 | `grindstone` | 1744 | 1744 |
| Sol | 1 | `sol` | 1705 | 1705 |
| Renjie Liu | 1 | `tailwind` | 1671 | 1671 |
| ironyard | 13 | `pyro` | 1546 | 1378 |
| Hydrogen | 1 | `hydrogen` | 1520 | 1520 |

## 2v2

800 of 800 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `astra` | Astra | 1753 | 160 | 115 | 0 | 45 | 72 |
| 2 | `grindstone` | Rust Hollow Garage | 1704 | 160 | 102 | 0 | 58 | 64 |
| 3 | `carbon` | Carbon | 1695 | 160 | 92 | 0 | 68 | 57 |
| 4 | `quillback` | Tin Lantern Garage | 1691 | 160 | 108 | 0 | 52 | 68 |
| 5 | `sol` | Sol | 1662 | 160 | 101 | 0 | 59 | 63 |
| 6 | `tailwind` | Renjie Liu | 1607 | 160 | 86 | 0 | 74 | 54 |
| 7 | `pyro` | ironyard | 1553 | 160 | 104 | 0 | 56 | 65 |
| 8 | `hydrogen` | Hydrogen | 1496 | 160 | 62 | 0 | 98 | 39 |
| 9 | `bastion` | ironyard | 1475 | 160 | 84 | 0 | 76 | 53 |
| 10 | `bulldozer` | ironyard | 1457 | 160 | 88 | 0 | 72 | 55 |
| 11 | `sapper` | ironyard | 1455 | 160 | 83 | 0 | 77 | 52 |
| 12 | `wolfpack` | ironyard | 1447 | 160 | 72 | 0 | 88 | 45 |
| 13 | `angler` | ironyard | 1438 | 160 | 59 | 0 | 101 | 37 |
| 14 | `wasp` | ironyard | 1428 | 160 | 74 | 0 | 86 | 46 |
| 15 | `boxer` | ironyard | 1401 | 160 | 70 | 0 | 90 | 44 |
| 16 | `longshot` | ironyard | 1379 | 160 | 59 | 0 | 101 | 37 |
| 17 | `thumper` | ironyard | 1378 | 160 | 66 | 0 | 94 | 41 |
| 18 | `hornet` | ironyard | 1374 | 160 | 67 | 0 | 93 | 42 |
| 19 | `rookie` | ironyard | 1338 | 160 | 59 | 0 | 101 | 37 |
| 20 | `medic` | ironyard | 1331 | 160 | 49 | 0 | 111 | 31 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Astra | 1 | `astra` | 1753 | 1753 |
| Rust Hollow Garage | 1 | `grindstone` | 1704 | 1704 |
| Carbon | 1 | `carbon` | 1695 | 1695 |
| Tin Lantern Garage | 1 | `quillback` | 1691 | 1691 |
| Sol | 1 | `sol` | 1662 | 1662 |
| Renjie Liu | 1 | `tailwind` | 1607 | 1607 |
| ironyard | 13 | `pyro` | 1553 | 1420 |
| Hydrogen | 1 | `hydrogen` | 1496 | 1496 |

## 3v3

720 of 720 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `astra` | Astra | 1727 | 198 | 126 | 0 | 72 | 64 |
| 2 | `quillback` | Tin Lantern Garage | 1682 | 222 | 142 | 0 | 80 | 64 |
| 3 | `sol` | Sol | 1621 | 186 | 97 | 0 | 89 | 52 |
| 4 | `carbon` | Carbon | 1597 | 210 | 116 | 0 | 94 | 55 |
| 5 | `grindstone` | Rust Hollow Garage | 1580 | 204 | 104 | 0 | 100 | 51 |
| 6 | `tailwind` | Renjie Liu | 1567 | 210 | 92 | 0 | 118 | 44 |
| 7 | `pyro` | ironyard | 1547 | 216 | 122 | 0 | 94 | 56 |
| 8 | `bulldozer` | ironyard | 1544 | 216 | 141 | 0 | 75 | 65 |
| 9 | `longshot` | ironyard | 1530 | 228 | 136 | 0 | 92 | 60 |
| 10 | `angler` | ironyard | 1506 | 228 | 128 | 0 | 100 | 56 |
| 11 | `bastion` | ironyard | 1484 | 210 | 114 | 0 | 96 | 54 |
| 12 | `boxer` | ironyard | 1470 | 240 | 120 | 0 | 120 | 50 |
| 13 | `sapper` | ironyard | 1453 | 216 | 113 | 0 | 103 | 52 |
| 14 | `hornet` | ironyard | 1422 | 222 | 104 | 0 | 118 | 47 |
| 15 | `wasp` | ironyard | 1419 | 216 | 97 | 0 | 119 | 45 |
| 16 | `hydrogen` | Hydrogen | 1412 | 222 | 61 | 0 | 161 | 28 |
| 17 | `wolfpack` | ironyard | 1399 | 216 | 99 | 0 | 117 | 46 |
| 18 | `thumper` | ironyard | 1370 | 216 | 93 | 0 | 123 | 43 |
| 19 | `medic` | ironyard | 1369 | 216 | 86 | 0 | 130 | 40 |
| 20 | `rookie` | ironyard | 1320 | 228 | 69 | 0 | 159 | 30 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Astra | 1 | `astra` | 1727 | 1727 |
| Tin Lantern Garage | 1 | `quillback` | 1682 | 1682 |
| Sol | 1 | `sol` | 1621 | 1621 |
| Carbon | 1 | `carbon` | 1597 | 1597 |
| Rust Hollow Garage | 1 | `grindstone` | 1580 | 1580 |
| Renjie Liu | 1 | `tailwind` | 1567 | 1567 |
| ironyard | 13 | `pyro` | 1547 | 1449 |
| Hydrogen | 1 | `hydrogen` | 1412 | 1412 |
