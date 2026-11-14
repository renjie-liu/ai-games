# Independent read-only review: bounded public Live context updates

Verdict: **pass for bounded, context-only synchronization; no remaining implementation blocker in this scope**. This is a local independent code/probe review, not a Mark/Bezos or hosted GitHub approval.

Baseline: `afb3b374a55ffb6967eb23e427daf0a4cb8a0dd1`. Reviewed uncommitted product content is pinned by `PRODUCT-SHA256SUMS` (six production files and two tests). No production files were edited by this reviewer.

## Independently executed

- Node: 19/19 passed (9 public-update tests and 10 existing Live/gate tests), `node-updates-final.txt`.
- Python: 24/24 passed (12 update tests plus 12 existing Live tests), `python-updates-final.txt`.
- Five independent session probes: used the real `Session.send_content`, a fixture-only ledger and fake SDK transport; `socket.connect` was blocked. Idle delivery and busy merge each sent exactly once with `turn_complete=False`; scope cancellation and exhausted text budget sent zero; a begun send followed by stop was recorded honestly and was not retried. See `session-probe.py/json`.
- Four HTTP fixture cases were independently regenerated using the inspected author fixture script. It creates a temporary game copy and replaces only fixture provider behavior/capture. The actual loopback server, worker, harness and Room engine ran. Delivery coalesced accepted key handoff (#3/#4) and a shared clue into one context send; repeated shares did not send again. Pause/start/stop before the flush produced zero context sends. See `http/` and `http-run.txt`.
- The historical exhausted ledger SHA256 remains `b1c8f465ddbea2ce915274381e35e2cb1575ef1e6c60fbd42ded91df584909c6`.
- Reviewer real model requests: **0**. No microphone, credentials, deployment, merge or existing 4174 process changes.

## Findings resolved during review

1. The initial diff discarded same-epoch updates if the player was speaking at flush time. The current implementation passes those updates to the worker, which holds them until speaking/generation/tool activity ends. Speech onset still clears older queued work. Verified by `edge-probe.mjs` / `edge-after.json` and the new Node regression.
2. The initial dedupe guard checked the 128-entry limit only before looping over a multi-event receipt. The current loop also checks the cap, so it stops at 128. Verified by the same independent probe. These initial issues were found by source inspection; the durable executable probe ran after the fixes.
3. Context audit rows now preserve `update_epoch` separately from the current epoch, avoiding ambiguity when an already-started send completes after cancellation.

## Safety and scope assessment

- The route forwards only successful human share/accept/decline/cancel/action results. The payload is rebuilt from selected public Room events, safe receipt fields, public physics and pending proposal metadata. Human `result.message`, private observations, hints, notes, action oracle and credentials are excluded. Shared clue text is public only after actual share.
- Event replay and repeated clue sharing are deduplicated. The Node side uses a 250 ms debounce, minimum 2 seconds between batches, at most 3 batches, 12 events per pending set, 2,400 bytes per update, 4,800 total update bytes and 128 seen IDs. The worker independently validates shape/epoch/size, coalesces pending events, rate-limits sends and debits the existing text budget. It starts no new client/session, retries or inference turn.
- Waiting behavior is preserved by incomplete content (`turn_complete=False`), not by pretending keyword scripts understand voice. The worker waits for generation/tool/speech idle, and the normal observe ticket / Room command path remains the sole execution authority.
- Pause/stop/stream closure/epoch changes cancel unsent queues. Content whose send method already began cannot be recalled; the audit says send returned or failed, with no retry/refund. It does not claim cancellation undid an engine action.
- Public Trace lists references and delivery lifecycle, not private update text or a fake action. `fixture_sent` and `transport_sent` are explicitly distinguished; neither means model understanding or cooperation.

## Remaining limitations

- This closes context transport only. It deliberately does **not** make the idle partner start a new answer after a button click. Do not claim the collaboration gap is wholly solved.
- No real provider, live microphone or later-audio reaction was tested. The installed SDK documents the incomplete-content behavior and cautions about interleaving client content/realtime input; offline passes cannot establish real conversation behavior.
- Limits are conservative: overflow or exhausted update quotas omit notification rather than retrying, splitting into unlimited sends, or buying more budget. A later normal observe still reads current own/shared state.
- The original 4174 runtime and PR #3 deployment status are outside this code verification; the incremental PR must not be described as the running build.

## Re-running the independent edge probe

The script is relocatable: set `PARTITION_GAME_ROOT` to the absolute `partition-escape` game directory, then run `node edge-probe.mjs`. It also accepts that directory as its first CLI argument. It performs no network calls and changes no game files.
