# Ironyard — seven-version tournament

Verified 2026-11-17 (Asia/Shanghai) through Ironyard MCP at [`92e7e56`](https://github.com/renjie-liu/ai-games/commit/92e7e5670d10466735f7763e200978e80836ab60), engine 0.6.0. **3528 fresh matches; all completed, zero reported controller errors.**

This field includes Astra and Sol v3, developed through MCP scouting, replay analysis and paired validation. Their original generation-model attribution is retained with `editor: Codex`. See [the v3 iteration report](docs/MCP_ITERATION_V3.md) for the builds and the separate held-out comparison. Fable is Quillback, Opus is Grindstone, and Muse is Tailwind.

## Two separate leaderboards

The [20-bot ladder](LEADERBOARD.md) fits ratings over all results; its team queues mix different bots and rotate slots. This seven-entry tournament fills each team with one version and sorts by points. Each mode has its own ranking.

### Complete ladder — seven model entries shown

| Entry | Bot | 1v1 | 2v2 | 3v3 |
|---|---|---:|---:|---:|
| Fable | `quillback` | 1 | 2 | 1 |
| Sol | `sol` | 2 | 1 | 2 |
| Astra | `astra` | 3 | 3 | 3 |
| Opus | `grindstone` | 4 | 6 | 6 |
| Carbon | `carbon` | 5 | 5 | 4 |
| Hydrogen | `hydrogen` | 6 | 8 | 10 |
| Muse | `tailwind` | 7 | 4 | 5 |

Ranks are out of all 20 bots, including 13 reference bots. All 6916 fixtures are scored with zero errors: 1758 affected matches were replayed and 5158 unchanged-source results were reused from the fully rerun previous season.

### Seven-version tournament

| Entry | 1v1 | 2v2 | 3v3 |
|---|---:|---:|---:|
| Sol | 1 | 2 | 2 |
| Fable | 2 | 1 | 1 |
| Astra | 3 | 3 | 3 |
| Opus | 4 | 4 | 4 |
| Carbon | 5 | 5 | 6 |
| Muse | 6 | 6 | 5 |
| Hydrogen | 7 | 7 | 7 |

## Format

- 1200 credits per vehicle; all 14 maps; seeds 1 and 2; both spawn sides.
- 1176 matches per mode: 21 pairings × 14 maps × 2 seeds × 2 sides. Each entry plays 336 games, 56 against each opponent.
- In 2v2 and 3v3, one source fills every team slot. Slot-dependent designs and controllers remain allowed.
- Win = 3 points; draw = 1; loss = 0. Ties use cumulative remaining-hull difference (rounded to two decimals), then bot id.
- Three fresh MCP `run_tournament` calls produced these standings and head-to-head counts. No errors, forfeits or unscored games occurred.
- These results describe the submitted programs against this field. The seed-73 comparison in the iteration report instead holds the opposing programs at their old revisions.

## 1v1

| Rank | Entry | Points | W | D | L | Win % | Hull difference |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | Sol | 849 | 283 | 0 | 53 | 84.2 | 197.68 |
| 2 | Fable | 774 | 258 | 0 | 78 | 76.8 | 156.55 |
| 3 | Astra | 741 | 247 | 0 | 89 | 73.5 | 133.21 |
| 4 | Opus | 465 | 155 | 0 | 181 | 46.1 | -36.80 |
| 5 | Carbon | 390 | 130 | 0 | 206 | 38.7 | -72.09 |
| 6 | Muse | 186 | 62 | 0 | 274 | 18.5 | -178.65 |
| 7 | Hydrogen | 123 | 41 | 0 | 295 | 12.2 | -199.90 |

### 1v1 head-to-head

Each cell is the row entrant’s wins–draws–losses.

| Entry | Sol | Fable | Astra | Opus | Carbon | Muse | Hydrogen |
|---|---:|---:|---:|---:|---:|---:|---:|
| Sol | — | 42–0–14 | 43–0–13 | 45–0–11 | 56–0–0 | 54–0–2 | 43–0–13 |
| Fable | 14–0–42 | — | 21–0–35 | 56–0–0 | 56–0–0 | 56–0–0 | 55–0–1 |
| Astra | 13–0–43 | 35–0–21 | — | 50–0–6 | 50–0–6 | 55–0–1 | 44–0–12 |
| Opus | 11–0–45 | 0–0–56 | 6–0–50 | — | 27–0–29 | 56–0–0 | 55–0–1 |
| Carbon | 0–0–56 | 0–0–56 | 6–0–50 | 29–0–27 | — | 43–0–13 | 52–0–4 |
| Muse | 2–0–54 | 0–0–56 | 1–0–55 | 0–0–56 | 13–0–43 | — | 46–0–10 |
| Hydrogen | 13–0–43 | 1–0–55 | 12–0–44 | 1–0–55 | 4–0–52 | 10–0–46 | — |

## 2v2

| Rank | Entry | Points | W | D | L | Win % | Hull difference |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | Fable | 846 | 282 | 0 | 54 | 83.9 | 365.97 |
| 2 | Sol | 786 | 262 | 0 | 74 | 78.0 | 273.85 |
| 3 | Astra | 759 | 253 | 0 | 83 | 75.3 | 247.95 |
| 4 | Opus | 447 | 149 | 0 | 187 | 44.3 | -70.87 |
| 5 | Carbon | 363 | 121 | 0 | 215 | 36.0 | -135.32 |
| 6 | Muse | 228 | 76 | 0 | 260 | 22.6 | -305.23 |
| 7 | Hydrogen | 99 | 33 | 0 | 303 | 9.8 | -376.36 |

### 2v2 head-to-head

Each cell is the row entrant’s wins–draws–losses.

| Entry | Fable | Sol | Astra | Opus | Carbon | Muse | Hydrogen |
|---|---:|---:|---:|---:|---:|---:|---:|
| Fable | — | 29–0–27 | 30–0–26 | 56–0–0 | 55–0–1 | 56–0–0 | 56–0–0 |
| Sol | 27–0–29 | — | 35–0–21 | 44–0–12 | 56–0–0 | 53–0–3 | 47–0–9 |
| Astra | 26–0–30 | 21–0–35 | — | 51–0–5 | 52–0–4 | 54–0–2 | 49–0–7 |
| Opus | 0–0–56 | 12–0–44 | 5–0–51 | — | 24–0–32 | 52–0–4 | 56–0–0 |
| Carbon | 1–0–55 | 0–0–56 | 4–0–52 | 32–0–24 | — | 34–0–22 | 50–0–6 |
| Muse | 0–0–56 | 3–0–53 | 2–0–54 | 4–0–52 | 22–0–34 | — | 45–0–11 |
| Hydrogen | 0–0–56 | 9–0–47 | 7–0–49 | 0–0–56 | 6–0–50 | 11–0–45 | — |

## 3v3

| Rank | Entry | Points | W | D | L | Win % | Hull difference |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | Fable | 924 | 308 | 0 | 28 | 91.7 | 618.05 |
| 2 | Sol | 822 | 274 | 0 | 62 | 81.5 | 428.67 |
| 3 | Astra | 702 | 234 | 0 | 102 | 69.6 | 268.18 |
| 4 | Opus | 366 | 122 | 0 | 214 | 36.3 | -221.36 |
| 5 | Muse | 315 | 105 | 0 | 231 | 31.3 | -298.92 |
| 6 | Carbon | 303 | 101 | 0 | 235 | 30.1 | -259.19 |
| 7 | Hydrogen | 96 | 32 | 0 | 304 | 9.5 | -535.44 |

### 3v3 head-to-head

Each cell is the row entrant’s wins–draws–losses.

| Entry | Fable | Sol | Astra | Opus | Muse | Carbon | Hydrogen |
|---|---:|---:|---:|---:|---:|---:|---:|
| Fable | — | 37–0–19 | 47–0–9 | 56–0–0 | 56–0–0 | 56–0–0 | 56–0–0 |
| Sol | 19–0–37 | — | 41–0–15 | 53–0–3 | 55–0–1 | 55–0–1 | 51–0–5 |
| Astra | 9–0–47 | 15–0–41 | — | 53–0–3 | 54–0–2 | 50–0–6 | 53–0–3 |
| Opus | 0–0–56 | 3–0–53 | 3–0–53 | — | 37–0–19 | 28–0–28 | 51–0–5 |
| Muse | 0–0–56 | 1–0–55 | 2–0–54 | 19–0–37 | — | 36–0–20 | 47–0–9 |
| Carbon | 0–0–56 | 1–0–55 | 6–0–50 | 28–0–28 | 20–0–36 | — | 46–0–10 |
| Hydrogen | 0–0–56 | 5–0–51 | 3–0–53 | 5–0–51 | 9–0–47 | 10–0–46 | — |

## Reproduce and inspect

From `ironyard/` at the commit above:

```bash
node node/cli.js tournament --bots quillback,grindstone,sol,astra,carbon,hydrogen,tailwind --mode 1v1 --maps all --seeds 2 --budget 1200 --json > tournament-1v1.json
node node/cli.js tournament --bots quillback,grindstone,sol,astra,carbon,hydrogen,tailwind --mode 2v2 --maps all --seeds 2 --budget 1200 --json > tournament-2v2.json
node node/cli.js tournament --bots quillback,grindstone,sol,astra,carbon,hydrogen,tailwind --mode 3v3 --maps all --seeds 2 --budget 1200 --json > tournament-3v3.json
```

[MCP tournament results and source hashes](docs/tournaments/seven-models-v3-2026-11-17.json) · [CSV of both leaderboards](docs/tournaments/rankings-v3-2026-11-17.csv).

The [previous v2 report](https://github.com/renjie-liu/ai-games/blob/80fd5eb03be3bc332207454b90bb9bd031c16e3a/ironyard/TOURNAMENT.md) and [its raw results](docs/tournaments/seven-models-2026-11-17.json) remain available. The [engine-0.5.0 report](https://github.com/renjie-liu/ai-games/blob/413aea518c08696c44bf9a6a6590e0812633c608/ironyard/TOURNAMENT.md) is historical.

| Entry | Recorded model | Source SHA-256 |
|---|---|---|
| Fable | Fable | `39cf00a3169b0d61f482df329e614bee07e264f203025a7ee4a17087a1fa51f6` |
| Opus | Opus | `e172fae3e036fceb9293a1fe65b5babeca2aa4b7163954f107a68261bbd80861` |
| Sol | gpt-6-sol | `6e558da7231aed64dd278ff029a45994288c9a8957dce4ac0f47735fa9562d65` |
| Astra | gpt-6-astra | `9531b63460d0d2dce0cad3d793cca5426f947ed8d105628c4aef1a3c2820fc82` |
| Carbon | gemini-4-carbon-medium | `63bbaaa5c28d13897abe9dc04a4dc4ba8ccd1f5deb6901094089fa05a3d44c3b` |
| Hydrogen | gemini-4-hydrogen-medium | `fa06bab72619796ef4a450e2bde18a79876d50685fb6302cf6e2fb51eb99f546` |
| Muse | Muse Spark | `64508535243e41c7dfe25aab5b6dd274c0f5d7f9a37ea80caee8962f288319c8` |
