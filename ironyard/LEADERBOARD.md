# Ironyard leaderboard

Engine 0.6.0 · 20 bots · 1200 credits per vehicle · mixed-slot-rotation-v2.

Status: **Complete**. Reproduce with `node node/cli.js ladder --write`, then `npm run build`.

## At a glance

Each mode is a separate ranking; there is no combined overall or model ranking. Model names below are self-reported source metadata. Missing attribution is not inferred from a commit author.

| bot | author | recorded model | 1v1 rank | 2v2 rank | 3v3 rank |
|---|---|---|---:|---:|---:|
| `quillback` | Fable | Fable | 1 | 1 | 1 |
| `grindstone` | Opus | Opus | 2 | 4 | 6 |
| `carbon` | gemini-4-carbon-medium | gemini-4-carbon-medium | 3 | 3 | 4 |
| `astra` | gpt-6-astra | gpt-6-astra | 4 | 2 | 2 |
| `sol` | gpt-6-sol | gpt-6-sol | 5 | 6 | 3 |
| `tailwind` | Muse Spark | Muse Spark | 6 | 5 | 5 |
| `hydrogen` | gemini-4-hydrogen-medium | gemini-4-hydrogen-medium | 7 | 8 | 14 |
| `sapper` | ironyard | Not recorded | 8 | 11 | 8 |
| `angler` | ironyard | Not recorded | 9 | 7 | 11 |
| `longshot` | ironyard | Not recorded | 10 | 9 | 7 |
| `boxer` | ironyard | Not recorded | 11 | 16 | 16 |
| `bulldozer` | ironyard | Not recorded | 12 | 10 | 13 |
| `bastion` | ironyard | Not recorded | 13 | 14 | 9 |
| `wolfpack` | ironyard | Not recorded | 14 | 12 | 18 |
| `pyro` | ironyard | Not recorded | 15 | 15 | 12 |
| `thumper` | ironyard | Not recorded | 16 | 17 | 10 |
| `wasp` | ironyard | Not recorded | 17 | 13 | 15 |
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
| 1 | `quillback` | Fable | 2444 | 532 | 528 | 0 | 4 | 99 |
| 2 | `grindstone` | Opus | 1988 | 532 | 471 | 0 | 61 | 89 |
| 3 | `carbon` | gemini-4-carbon-medium | 1847 | 532 | 432 | 0 | 100 | 81 |
| 4 | `astra` | gpt-6-astra | 1793 | 532 | 413 | 0 | 119 | 78 |
| 5 | `sol` | gpt-6-sol | 1668 | 532 | 359 | 0 | 173 | 68 |
| 6 | `tailwind` | Muse Spark | 1606 | 532 | 327 | 0 | 205 | 62 |
| 7 | `hydrogen` | gemini-4-hydrogen-medium | 1558 | 532 | 300 | 0 | 232 | 56 |
| 8 | `sapper` | ironyard | 1503 | 532 | 268 | 0 | 264 | 50 |
| 9 | `angler` | ironyard | 1469 | 532 | 247 | 1 | 284 | 46 |
| 10 | `longshot` | ironyard | 1446 | 532 | 233 | 0 | 299 | 44 |
| 11 | `boxer` | ironyard | 1444 | 532 | 232 | 0 | 300 | 44 |
| 12 | `bulldozer` | ironyard | 1436 | 532 | 227 | 0 | 305 | 43 |
| 13 | `bastion` | ironyard | 1394 | 532 | 202 | 0 | 330 | 38 |
| 14 | `wolfpack` | ironyard | 1384 | 532 | 196 | 0 | 336 | 37 |
| 15 | `pyro` | ironyard | 1376 | 532 | 191 | 0 | 341 | 36 |
| 16 | `thumper` | ironyard | 1373 | 532 | 189 | 0 | 343 | 36 |
| 17 | `wasp` | ironyard | 1354 | 532 | 178 | 0 | 354 | 34 |
| 18 | `medic` | ironyard | 1312 | 532 | 154 | 0 | 378 | 29 |
| 19 | `hornet` | ironyard | 1255 | 532 | 124 | 0 | 408 | 23 |
| 20 | `rookie` | ironyard | 1062 | 532 | 48 | 1 | 483 | 9 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Fable | 1 | `quillback` | 2444 | 2444 |
| Opus | 1 | `grindstone` | 1988 | 1988 |
| gemini-4-carbon-medium | 1 | `carbon` | 1847 | 1847 |
| gpt-6-astra | 1 | `astra` | 1793 | 1793 |
| gpt-6-sol | 1 | `sol` | 1668 | 1668 |
| Muse Spark | 1 | `tailwind` | 1606 | 1606 |
| gemini-4-hydrogen-medium | 1 | `hydrogen` | 1558 | 1558 |
| ironyard | 13 | `sapper` | 1503 | 1370 |

## 2v2

840 of 840 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `quillback` | Fable | 2092 | 168 | 159 | 0 | 9 | 95 |
| 2 | `astra` | gpt-6-astra | 1719 | 168 | 112 | 0 | 56 | 67 |
| 3 | `carbon` | gemini-4-carbon-medium | 1683 | 168 | 98 | 0 | 70 | 58 |
| 4 | `grindstone` | Opus | 1676 | 168 | 87 | 0 | 81 | 52 |
| 5 | `tailwind` | Muse Spark | 1662 | 168 | 96 | 0 | 72 | 57 |
| 6 | `sol` | gpt-6-sol | 1661 | 168 | 95 | 0 | 73 | 56 |
| 7 | `angler` | ironyard | 1543 | 168 | 82 | 0 | 86 | 49 |
| 8 | `hydrogen` | gemini-4-hydrogen-medium | 1515 | 168 | 56 | 0 | 112 | 33 |
| 9 | `longshot` | ironyard | 1512 | 168 | 95 | 0 | 73 | 56 |
| 10 | `bulldozer` | ironyard | 1445 | 168 | 88 | 0 | 80 | 52 |
| 11 | `sapper` | ironyard | 1436 | 168 | 69 | 0 | 99 | 41 |
| 12 | `wolfpack` | ironyard | 1430 | 168 | 71 | 0 | 97 | 42 |
| 13 | `wasp` | ironyard | 1429 | 168 | 93 | 0 | 75 | 55 |
| 14 | `bastion` | ironyard | 1419 | 168 | 79 | 0 | 89 | 47 |
| 15 | `pyro` | ironyard | 1412 | 168 | 84 | 0 | 84 | 50 |
| 16 | `boxer` | ironyard | 1403 | 168 | 77 | 0 | 91 | 46 |
| 17 | `thumper` | ironyard | 1353 | 168 | 61 | 0 | 107 | 36 |
| 18 | `medic` | ironyard | 1316 | 168 | 69 | 0 | 99 | 41 |
| 19 | `hornet` | ironyard | 1278 | 168 | 59 | 0 | 109 | 35 |
| 20 | `rookie` | ironyard | 1275 | 168 | 50 | 0 | 118 | 30 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Fable | 1 | `quillback` | 2092 | 2092 |
| gpt-6-astra | 1 | `astra` | 1719 | 1719 |
| gemini-4-carbon-medium | 1 | `carbon` | 1683 | 1683 |
| Opus | 1 | `grindstone` | 1676 | 1676 |
| Muse Spark | 1 | `tailwind` | 1662 | 1662 |
| gpt-6-sol | 1 | `sol` | 1661 | 1661 |
| ironyard | 13 | `angler` | 1543 | 1404 |
| gemini-4-hydrogen-medium | 1 | `hydrogen` | 1515 | 1515 |

## 3v3

756 of 756 matches on file.

| # | bot | author | rating | played | W | D | L | win % |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `quillback` | Fable | 1966 | 228 | 193 | 0 | 35 | 85 |
| 2 | `astra` | gpt-6-astra | 1766 | 204 | 111 | 0 | 93 | 54 |
| 3 | `sol` | gpt-6-sol | 1628 | 198 | 109 | 0 | 89 | 55 |
| 4 | `carbon` | gemini-4-carbon-medium | 1598 | 222 | 94 | 0 | 128 | 42 |
| 5 | `tailwind` | Muse Spark | 1583 | 222 | 100 | 0 | 122 | 45 |
| 6 | `grindstone` | Opus | 1566 | 216 | 95 | 0 | 121 | 44 |
| 7 | `longshot` | ironyard | 1547 | 240 | 138 | 0 | 102 | 57 |
| 8 | `sapper` | ironyard | 1522 | 228 | 138 | 0 | 90 | 61 |
| 9 | `bastion` | ironyard | 1509 | 216 | 116 | 0 | 100 | 54 |
| 10 | `thumper` | ironyard | 1484 | 228 | 115 | 0 | 113 | 50 |
| 11 | `angler` | ironyard | 1479 | 240 | 114 | 0 | 126 | 48 |
| 12 | `pyro` | ironyard | 1478 | 228 | 115 | 0 | 113 | 50 |
| 13 | `bulldozer` | ironyard | 1456 | 228 | 115 | 0 | 113 | 50 |
| 14 | `hydrogen` | gemini-4-hydrogen-medium | 1451 | 234 | 77 | 0 | 157 | 33 |
| 15 | `wasp` | ironyard | 1417 | 228 | 134 | 0 | 94 | 59 |
| 16 | `boxer` | ironyard | 1409 | 252 | 127 | 0 | 125 | 50 |
| 17 | `hornet` | ironyard | 1380 | 234 | 122 | 0 | 112 | 52 |
| 18 | `wolfpack` | ironyard | 1344 | 222 | 97 | 0 | 125 | 44 |
| 19 | `medic` | ironyard | 1290 | 228 | 77 | 0 | 151 | 34 |
| 20 | `rookie` | ironyard | 1276 | 240 | 81 | 0 | 159 | 34 |

### Authors — ordered by best bot

| author | bots | best bot | best rating | mean rating |
|---|---:|---|---:|---:|
| Fable | 1 | `quillback` | 1966 | 1966 |
| gpt-6-astra | 1 | `astra` | 1766 | 1766 |
| gpt-6-sol | 1 | `sol` | 1628 | 1628 |
| gemini-4-carbon-medium | 1 | `carbon` | 1598 | 1598 |
| Muse Spark | 1 | `tailwind` | 1583 | 1583 |
| Opus | 1 | `grindstone` | 1566 | 1566 |
| ironyard | 13 | `longshot` | 1547 | 1430 |
| gemini-4-hydrogen-medium | 1 | `hydrogen` | 1451 | 1451 |
