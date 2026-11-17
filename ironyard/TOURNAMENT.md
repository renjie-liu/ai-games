# Ironyard — seven-version tournament

Verified 2026-11-17 (Asia/Shanghai) at [`413aea5`](https://github.com/renjie-liu/ai-games/commit/413aea518c08696c44bf9a6a6590e0812633c608), engine 0.6.0. **3528 fresh matches; all completed, zero reported controller errors.**

Fable is Quillback, Opus is Grindstone, and Muse is Tailwind. This run includes the reworked two-mortar Quillback and Astra/Sol v2. Model labels describe the source metadata; Astra/Sol v2 additionally record Codex as editor.

## Two separate leaderboards

The [20-bot ladder](LEADERBOARD.md) fits ratings over all results. Its team queues mix different bots and rotate slots. This seven-entry tournament fills each team with one version and sorts by points. Each mode has its own ranking; there is no combined overall rank.

### Complete ladder — seven model entries shown

| Entry | Bot | 1v1 | 2v2 | 3v3 |
|---|---|---:|---:|---:|
| Fable | `quillback` | 1 | 1 | 1 |
| Opus | `grindstone` | 2 | 5 | 6 |
| Carbon | `carbon` | 3 | 3 | 4 |
| Astra | `astra` | 4 | 2 | 2 |
| Sol | `sol` | 5 | 4 | 3 |
| Muse | `tailwind` | 6 | 6 | 5 |
| Hydrogen | `hydrogen` | 7 | 9 | 15 |

These ranks are out of all 20 bots, including the 13 reference bots. A fresh 6916-match rerun reproduced the saved snapshot exactly.

### Seven-version tournament

| Entry | 1v1 | 2v2 | 3v3 |
|---|---:|---:|---:|
| Fable | 1 | 1 | 1 |
| Opus | 2 | 2 | 2 |
| Sol | 3 | 5 | 3 |
| Carbon | 4 | 3 | 6 |
| Astra | 5 | 4 | 4 |
| Muse | 6 | 6 | 5 |
| Hydrogen | 7 | 7 | 7 |

## Format

- 1200 credits per vehicle; all 14 maps; seeds 1 and 2; both spawn sides.
- 1176 matches per mode: 21 pairings × 14 maps × 2 seeds × 2 sides. Each entry plays 336 games, 56 against each opponent.
- In 2v2 and 3v3, one source fills every team slot. Slot-dependent designs and controllers remain allowed.
- Win = 3 points; draw = 1; loss = 0. Ties use cumulative remaining-hull difference (rounded to two decimals), then bot id.
- Reported controller errors are checked by the shared tournament result validator; this run has no errors or unscored games.
- Results measure these submitted programs against this field, not general model capability.

## 1v1

| Rank | Entry | Points | W | D | L | Win % | Hull difference |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | Fable | 1005 | 335 | 0 | 1 | 99.7 | 288.17 |
| 2 | Opus | 717 | 239 | 0 | 97 | 71.1 | 106.64 |
| 3 | Sol | 522 | 174 | 0 | 162 | 51.8 | -16.56 |
| 4 | Carbon | 510 | 170 | 0 | 166 | 50.6 | -13.11 |
| 5 | Astra | 399 | 133 | 0 | 203 | 39.6 | -49.77 |
| 6 | Muse | 309 | 103 | 0 | 233 | 30.7 | -104.56 |
| 7 | Hydrogen | 66 | 22 | 0 | 314 | 6.5 | -210.81 |

### 1v1 head-to-head

Each cell is the row entrant’s wins–draws–losses.

| Entry | Fable | Opus | Sol | Carbon | Astra | Muse | Hydrogen |
|---|---:|---:|---:|---:|---:|---:|---:|
| Fable | — | 56–0–0 | 56–0–0 | 56–0–0 | 56–0–0 | 56–0–0 | 55–0–1 |
| Opus | 0–0–56 | — | 49–0–7 | 27–0–29 | 52–0–4 | 56–0–0 | 55–0–1 |
| Sol | 0–0–56 | 7–0–49 | — | 20–0–36 | 43–0–13 | 54–0–2 | 50–0–6 |
| Carbon | 0–0–56 | 29–0–27 | 36–0–20 | — | 10–0–46 | 43–0–13 | 52–0–4 |
| Astra | 0–0–56 | 4–0–52 | 13–0–43 | 46–0–10 | — | 14–0–42 | 56–0–0 |
| Muse | 0–0–56 | 0–0–56 | 2–0–54 | 13–0–43 | 42–0–14 | — | 46–0–10 |
| Hydrogen | 1–0–55 | 1–0–55 | 6–0–50 | 4–0–52 | 0–0–56 | 10–0–46 | — |

## 2v2

| Rank | Entry | Points | W | D | L | Win % | Hull difference |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | Fable | 1002 | 334 | 0 | 2 | 99.4 | 544.52 |
| 2 | Opus | 678 | 226 | 0 | 110 | 67.3 | 170.06 |
| 3 | Carbon | 501 | 167 | 0 | 169 | 49.7 | -25.65 |
| 4 | Astra | 474 | 158 | 0 | 178 | 47.0 | -47.70 |
| 5 | Sol | 465 | 155 | 0 | 181 | 46.1 | -95.35 |
| 6 | Muse | 327 | 109 | 0 | 227 | 32.4 | -179.13 |
| 7 | Hydrogen | 81 | 27 | 0 | 309 | 8.0 | -366.74 |

### 2v2 head-to-head

Each cell is the row entrant’s wins–draws–losses.

| Entry | Fable | Opus | Carbon | Astra | Sol | Muse | Hydrogen |
|---|---:|---:|---:|---:|---:|---:|---:|
| Fable | — | 56–0–0 | 55–0–1 | 55–0–1 | 56–0–0 | 56–0–0 | 56–0–0 |
| Opus | 0–0–56 | — | 24–0–32 | 48–0–8 | 46–0–10 | 52–0–4 | 56–0–0 |
| Carbon | 1–0–55 | 32–0–24 | — | 15–0–41 | 35–0–21 | 34–0–22 | 50–0–6 |
| Astra | 1–0–55 | 8–0–48 | 41–0–15 | — | 26–0–30 | 28–0–28 | 54–0–2 |
| Sol | 0–0–56 | 10–0–46 | 21–0–35 | 30–0–26 | — | 46–0–10 | 48–0–8 |
| Muse | 0–0–56 | 4–0–52 | 22–0–34 | 28–0–28 | 10–0–46 | — | 45–0–11 |
| Hydrogen | 0–0–56 | 0–0–56 | 6–0–50 | 2–0–54 | 8–0–48 | 11–0–45 | — |

## 3v3

| Rank | Entry | Points | W | D | L | Win % | Hull difference |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | Fable | 1008 | 336 | 0 | 0 | 100.0 | 782.48 |
| 2 | Opus | 525 | 175 | 0 | 161 | 52.1 | 8.12 |
| 3 | Sol | 510 | 170 | 0 | 166 | 50.6 | -61.88 |
| 4 | Astra | 507 | 169 | 0 | 167 | 50.3 | -14.64 |
| 5 | Muse | 495 | 165 | 0 | 171 | 49.1 | -66.98 |
| 6 | Carbon | 384 | 128 | 0 | 208 | 38.1 | -148.65 |
| 7 | Hydrogen | 99 | 33 | 0 | 303 | 9.8 | -498.44 |

### 3v3 head-to-head

Each cell is the row entrant’s wins–draws–losses.

| Entry | Fable | Opus | Sol | Astra | Muse | Carbon | Hydrogen |
|---|---:|---:|---:|---:|---:|---:|---:|
| Fable | — | 56–0–0 | 56–0–0 | 56–0–0 | 56–0–0 | 56–0–0 | 56–0–0 |
| Opus | 0–0–56 | — | 31–0–25 | 28–0–28 | 37–0–19 | 28–0–28 | 51–0–5 |
| Sol | 0–0–56 | 25–0–31 | — | 29–0–27 | 34–0–22 | 34–0–22 | 48–0–8 |
| Astra | 0–0–56 | 28–0–28 | 27–0–29 | — | 15–0–41 | 44–0–12 | 55–0–1 |
| Muse | 0–0–56 | 19–0–37 | 22–0–34 | 41–0–15 | — | 36–0–20 | 47–0–9 |
| Carbon | 0–0–56 | 28–0–28 | 22–0–34 | 12–0–44 | 20–0–36 | — | 46–0–10 |
| Hydrogen | 0–0–56 | 5–0–51 | 8–0–48 | 1–0–55 | 9–0–47 | 10–0–46 | — |

## Reproduce and inspect

Run from the `ironyard/` directory at the commit above:

```bash
node node/cli.js tournament --bots quillback,grindstone,sol,astra,carbon,hydrogen,tailwind --mode 1v1 --maps all --seeds 2 --budget 1200 --json > tournament-1v1.json
node node/cli.js tournament --bots quillback,grindstone,sol,astra,carbon,hydrogen,tailwind --mode 2v2 --maps all --seeds 2 --budget 1200 --json > tournament-2v2.json
node node/cli.js tournament --bots quillback,grindstone,sol,astra,carbon,hydrogen,tailwind --mode 3v3 --maps all --seeds 2 --budget 1200 --json > tournament-3v3.json
```

[Raw matches and source hashes](docs/tournaments/seven-models-2026-11-17.json) · [CSV of both leaderboards](docs/tournaments/rankings-2026-11-17.csv).

Previous engine-0.5.0 tables remain in [the historical report](https://github.com/renjie-liu/ai-games/blob/413aea518c08696c44bf9a6a6590e0812633c608/ironyard/TOURNAMENT.md) and [raw historical results](docs/tournaments/seven-models-2026-11-15.json).

| Entry | Recorded model | Source SHA-256 |
|---|---|---|
| Fable | Fable | `39cf00a3169b0d61f482df329e614bee07e264f203025a7ee4a17087a1fa51f6` |
| Opus | Opus | `e172fae3e036fceb9293a1fe65b5babeca2aa4b7163954f107a68261bbd80861` |
| Sol | gpt-6-sol | `1688beec9619d2055459376afe800aea1e56843c35b753444488ffc4602241d7` |
| Astra | gpt-6-astra | `5e26d76bfabe6cfcb80d08fd19ffb74a7551355cc59eee428f449d62e29da27b` |
| Carbon | gemini-4-carbon-medium | `63bbaaa5c28d13897abe9dc04a4dc4ba8ccd1f5deb6901094089fa05a3d44c3b` |
| Hydrogen | gemini-4-hydrogen-medium | `fa06bab72619796ef4a450e2bde18a79876d50685fb6302cf6e2fb51eb99f546` |
| Muse | Muse Spark | `64508535243e41c7dfe25aab5b6dd274c0f5d7f9a37ea80caee8962f288319c8` |
