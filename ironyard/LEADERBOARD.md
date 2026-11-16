# Ironyard leaderboard

Engine 0.5.4 · 20 bots · 1200 credits per vehicle · mixed-slot-rotation-v2.

Status: **Complete**. Reproduce with `node node/cli.js ladder --write`, then `npm run build`.

## At a glance

Each mode is a separate ranking; there is no combined overall or model ranking. Model names below are self-reported source metadata. Missing attribution is not inferred from a commit author.

| bot | author | recorded model | 1v1 rank | 2v2 rank | 3v3 rank |
|---|---|---|---:|---:|---:|
| `grindstone` | Rust Hollow Garage | Opus | 1 | 5 | 6 |
| `quillback` | Tin Lantern Garage | Fable | 2 | 2 | 2 |
| `carbon` | Carbon | gemini-4-carbon-medium | 3 | 3 | 3 |
| `astra` | Astra | gpt-6-astra | 4 | 1 | 1 |
| `sol` | Sol | gpt-6-sol | 5 | 6 | 4 |
| `tailwind` | Renjie Liu | Muse Spark | 6 | 4 | 5 |
| `hydrogen` | Hydrogen | gemini-4-hydrogen-medium | 7 | 8 | 13 |
| `sapper` | ironyard | Not recorded | 8 | 9 | 15 |
| `pyro` | ironyard | Not recorded | 9 | 7 | 9 |
| `bulldozer` | ironyard | Not recorded | 10 | 11 | 7 |
| `angler` | ironyard | Not recorded | 11 | 14 | 8 |
| `bastion` | ironyard | Not recorded | 12 | 10 | 11 |
| `longshot` | ironyard | Not recorded | 13 | 15 | 10 |
| `wolfpack` | ironyard | Not recorded | 14 | 16 | 16 |
| `wasp` | ironyard | Not recorded | 15 | 12 | 14 |
| `boxer` | ironyard | Not recorded | 16 | 13 | 12 |
| `thumper` | ironyard | Not recorded | 17 | 20 | 18 |
| `medic` | ironyard | Not recorded | 18 | 19 | 19 |
| `hornet` | ironyard | Not recorded | 19 | 17 | 17 |
| `rookie` | ironyard | Not recorded | 20 | 18 | 20 |

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
| 1 | `grindstone` | Rust Hollow Garage | 1983 | 304 | 279 | 0 | 25 | 92 |
| 2 | `quillback` | Tin Lantern Garage | 1877 | 304 | 261 | 0 | 43 | 86 |
| 3 | `carbon` | Carbon | 1807 | 304 | 246 | 0 | 58 | 81 |
| 4 | `astra` | Astra | 1782 | 304 | 240 | 0 | 64 | 79 |
| 5 | `sol` | Sol | 1676 | 304 | 211 | 0 | 93 | 69 |
| 6 | `tailwind` | Renjie Liu | 1612 | 304 | 191 | 0 | 113 | 63 |
| 7 | `hydrogen` | Hydrogen | 1517 | 304 | 158 | 0 | 146 | 52 |
| 8 | `sapper` | ironyard | 1503 | 304 | 153 | 0 | 151 | 50 |
| 9 | `pyro` | ironyard | 1475 | 304 | 143 | 0 | 161 | 47 |
| 10 | `bulldozer` | ironyard | 1446 | 304 | 132 | 1 | 171 | 43 |
| 11 | `angler` | ironyard | 1437 | 304 | 128 | 2 | 174 | 42 |
| 12 | `bastion` | ironyard | 1433 | 304 | 127 | 1 | 176 | 42 |
| 13 | `longshot` | ironyard | 1433 | 304 | 127 | 1 | 176 | 42 |
| 14 | `wolfpack` | ironyard | 1417 | 304 | 122 | 0 | 182 | 40 |
| 15 | `wasp` | ironyard | 1395 | 304 | 114 | 0 | 190 | 38 |
| 16 | `boxer` | ironyard | 1375 | 304 | 107 | 0 | 197 | 35 |
| 17 | `thumper` | ironyard | 1343 | 304 | 96 | 0 | 208 | 32 |
| 18 | `medic` | ironyard | 1341 | 304 | 95 | 0 | 209 | 31 |
| 19 | `hornet` | ironyard | 1251 | 304 | 67 | 0 | 237 | 22 |
| 20 | `rookie` | ironyard | 1146 | 304 | 40 | 1 | 263 | 13 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Rust Hollow Garage | 1 | `grindstone` | 1983 | 1983 |
| Tin Lantern Garage | 1 | `quillback` | 1877 | 1877 |
| Carbon | 1 | `carbon` | 1807 | 1807 |
| Astra | 1 | `astra` | 1782 | 1782 |
| Sol | 1 | `sol` | 1676 | 1676 |
| Renjie Liu | 1 | `tailwind` | 1612 | 1612 |
| Hydrogen | 1 | `hydrogen` | 1517 | 1517 |
| ironyard | 13 | `sapper` | 1503 | 1384 |

## 2v2

800 of 800 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `astra` | Astra | 1682 | 160 | 102 | 0 | 58 | 64 |
| 2 | `quillback` | Tin Lantern Garage | 1672 | 160 | 106 | 0 | 54 | 66 |
| 3 | `carbon` | Carbon | 1665 | 160 | 93 | 0 | 67 | 58 |
| 4 | `tailwind` | Renjie Liu | 1655 | 160 | 100 | 0 | 60 | 63 |
| 5 | `grindstone` | Rust Hollow Garage | 1653 | 160 | 93 | 0 | 67 | 58 |
| 6 | `sol` | Sol | 1650 | 160 | 100 | 0 | 60 | 63 |
| 7 | `pyro` | ironyard | 1545 | 160 | 101 | 0 | 59 | 63 |
| 8 | `hydrogen` | Hydrogen | 1508 | 160 | 66 | 0 | 94 | 41 |
| 9 | `sapper` | ironyard | 1483 | 160 | 88 | 0 | 72 | 55 |
| 10 | `bastion` | ironyard | 1481 | 160 | 86 | 0 | 74 | 54 |
| 11 | `bulldozer` | ironyard | 1464 | 160 | 89 | 0 | 71 | 56 |
| 12 | `wasp` | ironyard | 1457 | 160 | 79 | 0 | 81 | 49 |
| 13 | `boxer` | ironyard | 1430 | 160 | 75 | 0 | 85 | 47 |
| 14 | `angler` | ironyard | 1426 | 160 | 56 | 0 | 104 | 35 |
| 15 | `longshot` | ironyard | 1423 | 160 | 66 | 0 | 94 | 41 |
| 16 | `wolfpack` | ironyard | 1421 | 160 | 67 | 0 | 93 | 42 |
| 17 | `hornet` | ironyard | 1369 | 160 | 63 | 0 | 97 | 39 |
| 18 | `rookie` | ironyard | 1368 | 160 | 62 | 0 | 98 | 39 |
| 19 | `medic` | ironyard | 1354 | 160 | 54 | 0 | 106 | 34 |
| 20 | `thumper` | ironyard | 1324 | 160 | 54 | 0 | 106 | 34 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Astra | 1 | `astra` | 1682 | 1682 |
| Tin Lantern Garage | 1 | `quillback` | 1672 | 1672 |
| Carbon | 1 | `carbon` | 1665 | 1665 |
| Renjie Liu | 1 | `tailwind` | 1655 | 1655 |
| Rust Hollow Garage | 1 | `grindstone` | 1653 | 1653 |
| Sol | 1 | `sol` | 1650 | 1650 |
| ironyard | 13 | `pyro` | 1545 | 1427 |
| Hydrogen | 1 | `hydrogen` | 1508 | 1508 |

## 3v3

720 of 720 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `astra` | Astra | 1747 | 198 | 127 | 0 | 71 | 64 |
| 2 | `quillback` | Tin Lantern Garage | 1696 | 222 | 135 | 0 | 87 | 61 |
| 3 | `carbon` | Carbon | 1653 | 210 | 124 | 0 | 86 | 59 |
| 4 | `sol` | Sol | 1633 | 186 | 94 | 0 | 92 | 51 |
| 5 | `tailwind` | Renjie Liu | 1599 | 210 | 94 | 0 | 116 | 45 |
| 6 | `grindstone` | Rust Hollow Garage | 1596 | 204 | 100 | 0 | 104 | 49 |
| 7 | `bulldozer` | ironyard | 1568 | 216 | 147 | 0 | 69 | 68 |
| 8 | `angler` | ironyard | 1520 | 228 | 137 | 0 | 91 | 60 |
| 9 | `pyro` | ironyard | 1512 | 216 | 118 | 0 | 98 | 55 |
| 10 | `longshot` | ironyard | 1488 | 228 | 130 | 0 | 98 | 57 |
| 11 | `bastion` | ironyard | 1480 | 210 | 114 | 0 | 96 | 54 |
| 12 | `boxer` | ironyard | 1460 | 240 | 121 | 0 | 119 | 50 |
| 13 | `hydrogen` | Hydrogen | 1460 | 222 | 67 | 0 | 155 | 30 |
| 14 | `wasp` | ironyard | 1445 | 216 | 108 | 0 | 108 | 50 |
| 15 | `sapper` | ironyard | 1421 | 216 | 111 | 0 | 105 | 51 |
| 16 | `wolfpack` | ironyard | 1396 | 216 | 104 | 0 | 112 | 48 |
| 17 | `hornet` | ironyard | 1383 | 222 | 96 | 0 | 126 | 43 |
| 18 | `thumper` | ironyard | 1340 | 216 | 87 | 0 | 129 | 40 |
| 19 | `medic` | ironyard | 1314 | 216 | 74 | 0 | 142 | 34 |
| 20 | `rookie` | ironyard | 1308 | 228 | 72 | 0 | 156 | 32 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Astra | 1 | `astra` | 1747 | 1747 |
| Tin Lantern Garage | 1 | `quillback` | 1696 | 1696 |
| Carbon | 1 | `carbon` | 1653 | 1653 |
| Sol | 1 | `sol` | 1633 | 1633 |
| Renjie Liu | 1 | `tailwind` | 1599 | 1599 |
| Rust Hollow Garage | 1 | `grindstone` | 1596 | 1596 |
| ironyard | 13 | `bulldozer` | 1568 | 1433 |
| Hydrogen | 1 | `hydrogen` | 1460 | 1460 |
