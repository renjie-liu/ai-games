# Independent bounded Live state-update design review

Read-only reviewer; no model requests, microphone capture, quota edits or product edits.

Baseline: ai-games afb3b374a55ffb6967eb23e427daf0a4cb8a0dd1.

## Scope judgment

A bounded `send_client_content(turn_complete=False)` path closes the narrow transport gap: public button outcomes enter the existing Live session without starting a new inference turn. It does not show that the partner resumes cooperation or responds immediately after confirmation. Delivery must describe that limitation.

The locally installed Google GenAI SDK's `live.py:170-217` says incomplete client content waits for further client content and warns that interleaving client content/realtime input may produce unexpected results. Offline mocks cannot establish real provider reaction to later microphone input. Do not promise the next audio turn works from these tests.

## Required boundaries

1. Extract only success receipt event IDs and public Room events. Never serialize the human result message, own view, notes, action oracle, credentials or unshared hints.
2. Dedupe receipt/event replay and semantic duplicate clue shares; repeated share currently generates new event IDs.
3. Keep one bounded pending update, coalesce while busy, flush only via a one-shot timer or real idle transition; no wake loop.
4. Use actual worker ready/tool/audio/turn-complete signals for busy state. Node currently has no worker generation-busy signal.
5. Cancel queued updates on speech/text epoch change and pause/stop/stream closure. Revalidate at worker dispatch, not only when scheduling. Already sent content remains sent and cannot be claimed recalled.
6. Apply worker-side payload/epoch limits and the existing text-byte debit before SDK send. No retry on failure; connection/tool/turn budget remains unchanged.
7. Trace links the sent public state to request/event IDs, marks fixture vs real, and never claims an action, model understanding or a new successful turn.

## Minimum tests

- Real Room accept/share events reach the worker payload; inspect/hint and unrelated unsuccessful commands do not.
- Same receipt twice; same shared clue under distinct IDs; merge multiple distinct events; min interval; fixed max count and cumulative bytes.
- Busy then idle; fresh events during busy; queue cancellation before timer and after pipe handoff; stop/pause/epoch/stream close.
- SDK-blocked/failed send, quota exhaustion, duplicate payload, old epoch, worker stale state; no retry.
- Unshared private sentinel absent from payload and public Trace; deliberately shared clue included; no forged command path.
- Independent end-to-end fixture demonstrates one existing session, zero real calls, normal harness action receipts unchanged.

## Review status

Design reviewed; implementation review pending.
