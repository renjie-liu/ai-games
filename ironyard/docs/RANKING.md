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

The standard budget is 1200 credits per vehicle; engine 0.5.4 uses eight maps.

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

Worker results are checked for controller exceptions and a finished match. A failure reliably attributed to one bot is a forfeit for that side and is prominently reported. An unattributed failure is **unscored**, not a draw, and is retried on the next call. A match that finished but in which a controller threw is scored as the engine played it (the rules let a controller throw: it idles for that tick) and is reported with its error — leaving it unscored would let a bot throw once whenever it was losing and never have a loss on file. `ladder --write` refuses an incomplete or error-containing season.

Custom browser, CLI and MCP tournaments are stricter on one point: a finished match in which a controller threw is left unscored there, as an unfinished one is, so a table made by hand never ranks a bot on matches it broke in (fix the bot and run it again); a thrown exception attributed to exactly one team is a forfeit. Only clean results and attributed forfeits earn points. Completion counts distinguish scheduled, attempted, scored, unscored and remaining games. CLI tournaments return a nonzero exit code if any errors occur. Browser tournaments can be stopped, preserving completed results as provisional standings; restarting creates a fresh tournament.

Per-decision wall-clock timing is telemetry only. Engine 0.5.1 removes the old 250 ms penalty that could cut off a healthy controller when the host was busy. Worker watchdogs and memory limits still protect the host; a triggered watchdog is reported as a failure, rather than silently changing the simulated battle. See the [0.5.1 review](REVIEW-2026-11-16.md).

Cache keys include engine version, map, mode, seed, spawn swap, ordered team members and source hashes. Changing the slot order therefore creates a distinct match. Each ladder call reads every source once and uses those exact bytes for metadata, hashes and all games in the call; an edit takes effect on the next call. Cache records also carry a result-check version: older records that did not check controller exceptions or freeze sources to their hashes are rerun once. If engine behavior changes without a version bump, its cache must be invalidated. Source metadata changes can also invalidate a bot's results because the full file is hashed.

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

## 20-bot season with Muse (engine 0.5.0 and main's 0.5.1)

Muse Spark’s `tailwind` joins unchanged from [PR #8](https://github.com/renjie-liu/ai-games/pull/8). All **4560** ladder matches completed without controller errors: 3040 solo, 800 doubles and 720 triples. Adding this entrant changes both the solo field and mixed-team schedule. The separate seven-entry, same-bot-team tournament is documented in [TOURNAMENT.md](../TOURNAMENT.md).

On 2026-11-16, all 4560 matches were rerun under engine 0.5.1 after the timing and tournament reliability fixes. No match errors occurred. Every rank, displayed rating, win/draw/loss count and author table exactly matched the previous 0.5.0 snapshot. The seven-entry tournament report remains its historical 0.5.0 run.

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

## 19-bot season replayed on a branch (engines 0.5.1 to 0.5.3)

While the seasons above were being played on `main`, a branch took the 19-bot field (before `tailwind`) from engine 0.5.0 through its own 0.5.1, 0.5.2 and 0.5.3, replaying the 4096-match season at each step. Those version numbers overlap with `main`'s 0.5.1, which is a different change. What each of them changed is listed in the next section; this one is the record of where the entries stood on that field.

| Engine, `grindstone` source | quillback | astra | carbon | grindstone | sol | hydrogen |
|---|---|---|---|---|---|---|
| 0.5.2, first rework | 1 / 2 / 2 | 2 / 1 / 1 | 3 / 3 / 3 | 4 / 4 / 7 | 5 / 5 / 5 | 6 / 7 / 14 |
| 0.5.3, second rework | 2 / 4 / 2 | 3 / 1 / 1 | 4 / 2 / 3 | 1 / 3 / 4 | 5 / 5 / 5 | 6 / 6 / 14 |

Ranks are 1v1 / 2v2 / 3v3. On 0.5.2, places 2 to 4 in 1v1 were one win apart over 288 matches (`astra` and `carbon` 240, `grindstone` 239): `grindstone` had first been reworked on 0.5.0, where that took it from 4th to 2nd in 1v1, and gave ten wins back when the steering and route-following fixes of 0.5.2 changed what it had been tuned against. The shield rule of 0.5.3, with no entry changed, moved little (`carbon` lost two 1v1 wins). After its second rework `grindstone` won 263 of 288 in 1v1.

## Current 20-bot season (engine 0.5.4)

Two lines of work ran side by side under overlapping version numbers. `main` went from 0.5.0 to the 0.5.1 described above (timing is telemetry, tournaments score failures properly, the ladder freezes its sources). A branch went from 0.5.0 through its own 0.5.1, 0.5.2 and 0.5.3 — fixes from two bug hunts in the game itself, one rule change, and a `grindstone` its author revised twice. Engine **0.5.4** is the two merged, and the table below is the whole 4560-match season replayed on it, with no controller errors.

| Bot | Recorded model | 1v1 | 2v2 | 3v3 |
|---|---|---:|---:|---:|
| grindstone | Opus | 1 | 5 | 6 |
| quillback | Fable | 2 | 2 | 2 |
| carbon | gemini-4-carbon-medium | 3 | 3 | 3 |
| astra | gpt-6-astra | 4 | 1 | 1 |
| sol | gpt-6-sol | 5 | 6 | 4 |
| tailwind | Muse Spark | 6 | 4 | 5 |
| hydrogen | gemini-4-hydrogen-medium | 7 | 8 | 13 |

What changed in the game between `main`'s 0.5.1 season and this one, in the order it was done on the branch:

- **0.5.1 (branch):** a flamethrower burnt a piece of several studs once per stud (so a 2x2 plate caught fire four times too fast), a repair kit did not put fires out as the rules say it does, a car thrown at a thick wall at about 40 m/s could end up inside it for good, and a design could smuggle a part type or facing that was not a string past validation.
- **0.5.2:** `driveTo` steered a reversing car the wrong way; the route follower could swap between two equally long ways round a hole on every re-plan; a shield that soaked a whole burst also soaked its shove, and did not soak the splash of a shell going off beside it; a hover craft could leave the map; a mortar could be aimed under its minimum range. These change how every car drives and what a shield stops.
- **0.5.3:** one rule: a shield now soaks the blast of a powder keg, a barrel or a mine from outside it as it soaks a shell's (the shove still arrives, and a keg that goes off while bolted to the car it is on goes straight through).
- **Ladder rule:** a match that finished but in which a controller threw is scored as the engine played it and reported with its error (see *Failure handling* above); it used to be left unscored.

`grindstone` is not the car of `main`'s seasons. Its author reworked it through the MCP loop (match insights, telemetry, replays, `evaluate_bot` against the other entries), first on 0.5.0 and again on 0.5.3 from replays of its most one-sided losses. The second time the car gave up one of three reactors for armor behind the cockpit and a rear chassis row that ties each track to the core a second way: in the replays a gun car shot out one lane of studs and a whole side of the car, track, laser and slope, fell off untouched. The controller stopped freezing in front of lava and barriers (it takes the route round), stopped fighting its own mine-dodging for the wheel, goes further for an item when no enemy is near, and in teams every car names the enemy it is shooting and prefers one a team-mate already shoots. It was tuned against seeds 1 and 2 of a head-to-head with `astra`, `sol`, `quillback`, `carbon` and `hydrogen` (1v1 113-47 before, 140-20 after; 2v2 100-60 to 132-28; 3v3 84-76 to 113-47); `tailwind` joined the field afterwards and was not among them, and the ladder's own season uses a different seed and the whole field.

Against `main`'s 0.5.1 season: in 1v1 `grindstone` goes from 4th to 1st, with 279 wins of 304; `quillback` is 2nd, `carbon` 3rd and `astra` 4th. On mixed teams it does not lead: 5th in 2v2 (from 2nd) and 6th in 3v3 (from 5th), where `astra`, `quillback` and `carbon` hold the first three places in both queues. In 2v2, places 3 to 6 are 15 rating points apart (`carbon` 1665, `tailwind` 1655, `grindstone` 1653, `sol` 1650), so their order there carries little weight. The second rework was measured with a whole team of `grindstone`; the ladder's team queues deal every bot onto mixed teams, which is a different question, and its gains there are smaller than the head-to-head suggests.

No other entry's source changed. The entries written against 0.5.0 are playing on an engine whose steering, route following and shields have since been corrected, which is part of why their places moved; none of them has been re-tuned. The seven-entry tournament in [TOURNAMENT.md](../TOURNAMENT.md) is the record of the 0.5.0 sources and has not been re-run.

Two things the tuning asked of the tools were added afterwards. `validate_design` and `scout_bot` now list `weakLanes`: the lanes of studs on which the least has to be shot away before a mover, or two guns, fall off without being hit, checked in the tests against what the engine drops when that lane is shot out. `evaluate_bot` takes the seeds themselves as well as a count, gives the comparison with a baseline as numbers as well as text, and says for each of the worst losses how much damage went each way.
