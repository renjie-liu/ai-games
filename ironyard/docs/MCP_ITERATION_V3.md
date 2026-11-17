# Astra and Sol v3 — MCP iteration

The v2 cars lost every solo match against the reworked Quillback in the saved seed-1 season. MCP replays showed why: their machine guns lost 75–80% of their incoming damage to armor and slope faces, while mortar blasts removed the guns and wheels. Simply increasing range was insufficient: early long-range prototypes retreated into walls and pit rims, then stopped under fire.

This revision was developed using the official MCP SDK client over stdio against Ironyard 0.6.0: `get_rules`, `scout_bot`, `validate_design`, `submit_bot`, `run_match`, `get_replay`, and paired `evaluate_bot` calls. Original generation-model labels are retained; both sources record `editor: Codex` and `revision: v3`.

## Vehicles and control

| Bot | Standard weapons | Defence and mobility | Cost |
|---|---|---|---:|
| Astra — Siege Battery | Two cannons and two mortars | Low cockpit, compact floor strips, gyro, four big wheels | 1197 |
| Sol — Sunshield | Two mortars and two rear machine guns | Shield, rear slope screen, low cockpit, four big wheels | 1194 |

The rear guns let the cars open distance using full forward drive. Mortars fire over walls, lead the target, and choose a landing column whose blast reaches valuable components. Cannons and machine guns keep their own lead and line-of-sight checks. Teammates share a focus target.

The largest control improvement is choosing a usable retreat. When the forward escape lane is blocked, the car samples clear routes, penalizes leaving the safe zone, and commits to its chosen route for 1.3 seconds. This gives it time to turn and leave, instead of immediately returning to the blocked heading. Blast warnings, terrain braking, and recovery from being stuck remain active.

Light builds use a reduced battery: two cannons for Astra (777 credits), three machine guns for Sol (785). Heavy builds add power and repair equipment; Astra also gains a shield. All three budgets passed MCP submission smoke tests in every mode and team slot.

## Independent paired validation

Training used seed **1** on six maps: Proving Ground, Sumo, Canyon, Skybridge, Cage and Frostbite. The final files were then frozen and tested on **seed 73**, all **14 maps**, both spawn sides, and all three modes. This seed was not used to choose the prototypes.

Each revision faces the same six opposing model bots frozen at [`80fd5eb`](https://github.com/renjie-liu/ai-games/commit/80fd5eb03be3bc332207454b90bb9bd031c16e3a). The other bot's v2 is kept in that field while one bot's revision is compared. Each cell below is **wins out of 168**; there were no draws.

| Bot | 1v1 v2 → v3 | 2v2 v2 → v3 | 3v3 v2 → v3 | Total v2 → v3 |
|---|---:|---:|---:|---:|
| Astra | 69 → 146 | 93 → 136 | 81 → 135 | 243 → 417 / 504 |
| Sol | 85 → 149 | 71 → 139 | 93 → 135 | 249 → 423 / 504 |

Across both revisions of both cars, **2016 matches** completed with **zero reported controller errors or unscored games**. Astra improved from 48.2% to 82.7% wins, and Sol from 49.4% to 83.9%.

Against Quillback specifically, Astra v3 won 18/28 solo, 12/28 doubles and 8/28 triples; Sol v3 won 19/28, 10/28 and 11/28. Both can now win this solo matchup, but Quillback remains stronger in the tested team matchups. These are observations on fixed programs, maps and a seed, not a general model ranking or a guarantee against future revisions.

[The MCP validation responses and source hashes](BOT_ITERATION_V3.json) include per-opponent changes, per-map counts, loss diagnoses and budget checks. The separate [current tournament report](../TOURNAMENT.md) and [complete ladder](../LEADERBOARD.md) measure the field with both v3 cars installed together.

To reproduce the paired match outcomes against the frozen old field from the `ironyard/` directory:

```bash
node tools/compare-bot-revisions.mjs --baseline 80fd5eb --seed 73 --out /tmp/astra-sol-v3-comparison.json
```

The [v2 comparison](BOT_ITERATION_V2.json) remains historical. No engine rules or opponent sources changed for this iteration.
