# Ranking methodology and audit

Ironyard ranks **submitted bot programs**, separately for 1v1, 2v2 and 3v3. A ranking does not measure a language model in general: builds, prompts, tuning effort and opponents differ. `meta.author` is an entrant label; `meta.model` is recorded attribution. The repository owner confirmed on 2026-11-15 that Quillback is Fable and Grindstone is Opus; those family names are now in their source metadata. No specific version was supplied. Garage/author labels and controller behavior are unchanged.

## Two different competitions

| | Saved ladder | Custom browser / CLI tournament |
|---|---|---|
| Order | Fitted individual rating | Points, then hull difference |
| Result value | Win 1; draw 0.5; loss 0 | Win 3 points; draw 1; loss 0 |
| Team modes | Different bots on mixed teams | One bot fills a whole team by default |
| Update | `node node/cli.js ladder --write`, then `npm run build` | Runs locally; does not update the saved ladder |

The website is a build-time snapshot. Adding a source file or running a custom tournament does not refresh it. A PR changes the public page only after merge and a successful Pages deployment.

## Season and fairness

The standard budget is 1200 credits per vehicle; engine 0.5.0 uses eight maps.

- **1v1:** every unordered pair plays all eight maps with seed 1, from both spawn sides. For 20 bots: `20 × 19 / 2 × 8 × 2 = 3040` matches; each bot plays 304.
- **Teams:** 40 deterministic rounds. A hash of the round and bot id determines participation; entrants who cannot fill an even number of full teams sit out. Bots from the same author are distributed across teams where possible, then opponents are scrambled.
- **Slots:** for each pairing, cyclically rotate both teams through all positions and play each rotation from both spawn sides, holding map and seed fixed. Every selected bot gets exactly equal exposure to each slot. Relative lineup permutations are not exhaustive.
- **2v2:** 20 bots form ten teams per round (none sit out): `40 × 5 pairings × 2 slots × 2 sides = 800` matches.
- **3v3:** 20 bots form six teams per round (two sit out): `40 × 3 pairings × 3 slots × 2 sides = 720` matches.

Total: **4560 matches**. Participation, opponents and map exposure are not perfectly equal in team modes. The author grouping and additive rating estimate do not eliminate every source of variance. More independent seeds, rounds and balanced map sampling would improve confidence; a narrow score gap is not proof of superiority.

## Rating formula

This is a regularized Bradley–Terry-style logistic fit, **not sequential Elo updates**. All results are fitted together, so their arrival order does not change the answer.

For a team A, `strength(A) = sum(rating(bot) - 1500)`. The estimated chance that A beats B is:

```text
P(A beats B) = 1 / (1 + 10^((strength(B) - strength(A)) / 400))
```

Each bot also has a prior equivalent to two draws against a fixed 1500-rated opponent. This anchors disconnected schedules and keeps undefeated bots finite. The solver minimizes the joint negative log likelihood, including the full teammate covariance Hessian, with damped Newton steps and a loss-decreasing line search.

Only match outcomes enter the fit. Damage, hull remaining and survival affect the game engine's winner/tiebreak decision, but do not add ladder points separately. Team outcomes count for each member; the model estimates their contributions jointly. It assumes additive strength and cannot fully represent role synergy or counter-matchups.

Sort by **unrounded rating**, then raw win percentage, then bot id. Display ratings as integers; two displayed ratings can match while their underlying ordering differs. Numerical differences below `1e-7` points are treated as ties. Bots with no scored games have no rank. Author tables sort by **best bot rating**, then mean rating, and exclude unplayed bots.

## Failure handling and cache

Worker results are checked for controller exceptions and a finished match. A failure reliably attributed to one bot is a forfeit for that side and is prominently reported. An unattributed failure is **unscored**, not a draw, and is retried on the next call. `ladder --write` refuses an incomplete or error-containing season.

Cache keys include engine version, map, mode, seed, spawn swap, ordered team members and source hashes. Changing the slot order therefore creates a distinct match. Cache records also carry a result-check version: older records that did not check controller exceptions are rerun once. If engine behavior changes without a version bump, its cache must be invalidated. Source metadata changes can also invalidate a bot's results because the full file is hashed.

## Issues found and corrected

1. **Permanent slot bias.** Author-by-author dealing put independent entrants such as Astra and Sol in the last slot in every team match. In the old 17-bot schedule Astra's slot counts were `[0, 76]` in 2v2 and `[0, 0, 54]` in 3v3. Slots affect spawn positions, leader selection and role-specific builds. All slots are now tested equally for each pairing.
2. **Early or unstable numerical fitting.** The old 200-iteration diagonal-only simultaneous update did not fully fit some seasons and ignored teammate correlations. On the old 17-bot season it differed by up to three displayed points from an independent optimizer. A full joint Newton fit now matches independent scalar-likelihood checks for 1v1, 2v2 and 3v3, including correlated fixed teams.
3. **Unattributed failures looked like draws.** They no longer earn draw results or silently count toward completion. Controller error lists are inspected and publication is blocked when errors remain.
4. **Rounded scores controlled ordering.** Rankings now use the underlying fitted scores; zero-game entries are explicitly unranked.
5. **Stale and ambiguous presentation.** The stale 15-bot snapshot was replaced with an audited 17-bot season, then expanded to 19 bots with Carbon and Hydrogen. Overview, per-mode, author and model fields are separated; custom tournament rules are labeled independently.

6. **Wolfpack repair target.** The expanded integration season exposed a null target when all allies scored above the old hard-coded threshold. Initializing the search with infinity ensures the mender chooses the best available ally. A deterministic regression reproduces the failure on Bog, seed 38, with swapped sides.

Previous 2656-match results used the old slot-biased team schedule. The corrected team ranks must be regenerated; they should not be compared as if the bots themselves changed. There is no synthetic overall rank across the three modes.

## Historical 17-bot audit results

The audit’s 3296-match, 17-bot season completed without controller errors. An independent SciPy/BFGS fit of the same match outcomes matched every displayed integer rating in all three queues (maximum difference: zero points). Unit tests additionally solve symmetric solo and correlated-team likelihoods independently by bisection, check exact slot balance, and verify that infrastructure/runtime failures are unscored and retried.

| Bot | Previous 1v1 / 2v2 / 3v3 ranks | Corrected 1v1 / 2v2 / 3v3 ranks |
|---|---|---|
| Quillback | 1 / 1 / 3 | 1 / 2 / 2 |
| Astra | 2 / 2 / 1 | 2 / 1 / 1 |
| Grindstone | 3 / 3 / 2 | 3 / 3 / 3 |
| Sol | 4 / 4 / 5 | 4 / 4 / 4 |

Rerunning every affected match after the Wolfpack repair-target fix left this 17-bot season’s results and ranks unchanged.

In that 17-bot season, Quillback and Grindstone both displayed 1641 in 3v3; their unrounded fitted ratings put Quillback ahead. The current expanded season is recorded in [LEADERBOARD.md](../LEADERBOARD.md).

## Historical 19-bot season

Carbon (`gemini-4-carbon-medium`) and Hydrogen (`gemini-4-hydrogen-medium`) are included from [PR #6](https://github.com/renjie-liu/ai-games/pull/6), alongside Astra, Sol and the existing roster. Their submitted source hashes are preserved. All **4096** matches completed without controller errors: 2736 solo, 640 doubles and 720 triples. Adding entrants changes the mixed-team schedule, so ranks differ from the historical 17-bot audit above.

| Bot | Recorded model | 1v1 | 2v2 | 3v3 |
|---|---|---:|---:|---:|
| quillback | Fable | 1 | 5 | 1 |
| grindstone | Opus | 4 | 1 | 4 |
| sol | gpt-6-sol | 5 | 3 | 5 |
| astra | gpt-6-astra | 2 | 2 | 2 |
| carbon | gemini-4-carbon-medium | 3 | 4 | 3 |
| hydrogen | gemini-4-hydrogen-medium | 6 | 6 | 11 |

## Current 20-bot season with Muse

Muse Spark’s `tailwind` joins unchanged from [PR #8](https://github.com/renjie-liu/ai-games/pull/8). All **4560** ladder matches completed without controller errors: 3040 solo, 800 doubles and 720 triples. Adding this entrant changes both the solo field and mixed-team schedule. The separate seven-entry, same-bot-team tournament is documented in [TOURNAMENT.md](../TOURNAMENT.md).

| Bot | Recorded model | 1v1 | 2v2 | 3v3 |
|---|---|---:|---:|---:|
| quillback | Fable | 1 | 4 | 2 |
| grindstone | Opus | 4 | 2 | 5 |
| sol | gpt-6-sol | 5 | 5 | 3 |
| astra | gpt-6-astra | 3 | 1 | 1 |
| carbon | gemini-4-carbon-medium | 2 | 3 | 4 |
| hydrogen | gemini-4-hydrogen-medium | 8 | 8 | 16 |
| tailwind | Muse Spark | 6 | 6 | 6 |

The locally verified 1v1 snapshot differs slightly from the aggregate originally attached to PR #8: Tailwind records 208 wins / 96 losses rather than 209 / 95, and Wasp records 105 wins rather than 103. Both team-mode tables match that submission exactly. Repeating all 32 Wasp-versus-Tailwind/Wolfpack solo matches reproduced the local outcomes and hull scores. The original PR did not include per-match results, so the cause of its aggregate difference is not established; this published snapshot uses the verified local results on Node v24.22.1.
