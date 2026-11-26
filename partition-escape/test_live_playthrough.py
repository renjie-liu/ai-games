"""Acceptance: one voice session is long enough to finish the game.

The production worker runs in-process against the real Room and the real LiveHub
(offline_live_room.mjs). The only stand-in is the provider: a scripted session behind
`client.aio.live.connect` (live_scripted.py). No key, no network, no microphone, and the
checkout's own `.live` grant is never read: the ledger root is a temporary directory.

What the scripted partner does is the shortest honest game: it looks at its four objects,
hands the key over, holds the brake, confirms the two shared actions, fits the brace and
walks out. The player talks for about five seconds a turn and the partner answers for four.
"""
import asyncio
import base64
import json
import os
import subprocess
import sys
import tempfile
import unittest
import urllib.request
from pathlib import Path
from unittest.mock import patch

import live_worker
from live_scripted import ScriptedLive, client_for
from live_worker import Session

ROOT = Path(__file__).resolve().parent
FRAME = base64.b64encode(bytes(1600)).decode()  # 50 ms of 16 kHz PCM, the size the page sends
PLAYER_SECONDS = 5
PARTNER_SECONDS = 4


class WholeGameInOneSession(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        (root / '.live').mkdir()
        grant = {'schema': 2, 'authorization': 'offline-acceptance', 'connectionLimit': 1, 'projectVerified': True}
        import live_budget
        (root / '.live' / 'authorization.json').write_text(json.dumps(grant))
        (root / '.live' / 'ledger.json').write_text(json.dumps(
            {'authorization': grant['authorization'], 'limits': live_budget.grant_limits(grant), 'attempts': []}))
        self.room = subprocess.Popen(['node', 'offline_live_room.mjs'], cwd=ROOT, stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, env=self.room_env(), bufsize=0)
        self.addCleanup(self.stop_room)
        first = json.loads(await asyncio.to_thread(self.room.stdout.readline))
        self.base = f"http://127.0.0.1:{first['port']}"
        self.tokens = first['tokens']
        self.events = []
        self.live = ScriptedLive(self.partner_turn)
        self.plan = []
        environment = {'PARTITION_RUN_ROOT': str(root / 'run'), 'PARTITION_SEAT': 'east',
                       'PARTITION_LIVE_SCOPE': first['scope'], 'PARTITION_ENDPOINT': self.base,
                       'PARTITION_SEAT_TOKEN': self.tokens['east']}
        for p in (patch.dict('os.environ', environment), patch('live_budget.ROOT', root),
                  patch('sys.stdin', self.room.stdout), patch('live_worker.key', lambda: 'k' * 32),
                  patch('google.genai.Client', lambda **_: client_for(self.live)),
                  patch('live_worker.emit', self.events.append), *self.limit_patches()):
            p.start()
            self.addCleanup(p.stop)
        self.session = Session(False)
        self.run_task = asyncio.create_task(self.session.run())
        self.addAsyncCleanup(self.finish)
        await self.until(lambda: self.seen('ready'), 'the worker never became ready')

    # The pause between two context updates is a pacing rule, not what is under test: shorten it
    # for both processes through the same override file a player would use.
    FAST = {'updates': {'interval_ms': 20, 'debounce_ms': 5}}

    def room_env(self):
        override = Path(self.temp.name) / 'limits.json'
        override.write_text(json.dumps(self.FAST))
        return {**os.environ, 'PARTITION_LIVE_LIMITS': str(override)}

    def limit_patches(self):
        import live_budget
        return [patch.dict(live_budget.UPDATES, self.FAST['updates'])]

    async def finish(self):
        for task in (self.run_task, self.live.running):
            if task and not task.done():
                task.cancel()
        await asyncio.gather(self.run_task, return_exceptions=True)

    def stop_room(self):
        self.room.stdin.close()
        self.room.terminate()
        self.room.wait(5)
        self.room.stdout.close()

    # --- helpers ---------------------------------------------------------------
    def seen(self, kind):
        return [e for e in self.events if e.get('type') == kind]

    def closed(self):
        return self.seen('closed')[0]['reason'] if self.seen('closed') else None

    async def until(self, condition, why, timeout=20):
        deadline = asyncio.get_running_loop().time() + timeout
        while not condition():
            turn = self.live.running
            if turn and turn.done() and not turn.cancelled() and turn.exception():
                raise turn.exception()
            if self.run_task.done() or self.closed():
                await asyncio.sleep(0)
                raise AssertionError(f'{why}: the session ended with {self.closed()!r} after '
                                     f'{self.session.ledger.row}')
            if asyncio.get_running_loop().time() > deadline:
                raise AssertionError(why)
            await asyncio.sleep(.01)

    def post(self, path, token, data):
        request = urllib.request.Request(self.base + path, data=json.dumps(data).encode(),
                                         headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.load(response)

    async def west(self, command):
        result = await asyncio.to_thread(self.post, '/command', self.tokens['west'], command)
        self.assertTrue(result['ok'], (command, result.get('message')))
        return result

    async def west_button(self, command):
        """A button press whose public result must reach the partner's context before the player goes on."""
        result = await self.west(command)
        ids = set(result['receipt']['roomEventIds'])
        def delivered():
            rows = [r for r in self.session.public if r['kind'] == 'context_update' and ids & set(r['room_event_ids'])]
            lost = [r for r in rows if r['status'] in ('not_delivered', 'rejected', 'canceled')]
            self.assertFalse(lost, f'the partner was never told about {command}: {lost}')
            return any(r['status'] == 'transport_sent' and ids <= set(r['room_event_ids']) for r in rows)
        await self.until(delivered, f'{command} never reached the partner')
        return result

    async def partner_turn(self, live, prompt):
        """The scripted model: observe, then one command with that ticket, for each step planned."""
        for kind, target in self.plan:
            observed = await live.call('observe', {'scope': live.scope()})
            self.assertTrue(observed.get('ok'), observed)
            if kind in ('accept', 'decline'):
                target = observed['view']['pending']['id']
            result = await live.call('seat_command', {'ticket': observed['ticket'], 'type': kind, 'id': target})
            self.assertTrue(result.get('ok'), (kind, target, result.get('code'), result.get('message')))
        await live.say(PARTNER_SECONDS)
        await live.complete()

    async def speak(self, *plan):
        """The player says something; the partner does `plan` and answers."""
        self.plan = list(plan)
        done = self.live.turns_done
        heard = len(self.seen('audio'))
        send = lambda b: asyncio.to_thread(self.post, '/live-input', self.tokens['west'], b)
        await send({'type': 'start'})
        for _ in range(PLAYER_SECONDS * 20):
            await send({'type': 'audio', 'data': FRAME})
        await send({'type': 'end'})
        await self.until(lambda: self.live.turns_done > done and len(self.seen('turn_complete')) > done,
                         f'the partner never finished {plan}')
        self.assertGreater(len(self.seen('audio')), heard, f'the reply after {plan} was not played')

    async def type(self, text, *plan):
        self.plan = list(plan)
        done = self.live.turns_done
        await self.west({'type': 'say', 'text': text})
        await self.until(lambda: self.live.turns_done > done and len(self.seen('turn_complete')) > done,
                         f'the partner never finished {plan}')

    def get(self, token):
        request = urllib.request.Request(self.base, headers={'Authorization': 'Bearer ' + token})
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.load(response)

    # --- the game --------------------------------------------------------------
    async def test_the_partner_can_get_ready_under_a_waiting_proposal(self):
        # The order a person plays in (real game of 2026-11-26): west proposes cutting the power as
        # soon as the gate is up, and only then does the partner hold the gate and confirm.
        await self.speak(('action', 'send-key'))
        view = (await self.west({'type': 'inspect', 'id': 'hatch'}))['view']
        await self.west_button({'type': 'accept', 'id': view['pending']['id']})
        await self.west_button({'type': 'action', 'id': 'unlock'})
        await self.west_button({'type': 'action', 'id': 'power-on'})
        await self.west_button({'type': 'action', 'id': 'power-off'})
        await self.speak(('action', 'hold-brake'), ('accept', None))
        public = (await asyncio.to_thread(self.get, self.tokens['watch']))['public']
        self.assertEqual((public['power'], public['gateOpen']), (False, True), 'the gate must stay up through the power cut')
        await asyncio.to_thread(self.post, '/live-input', self.tokens['west'], {'type': 'stop'})
        await asyncio.wait_for(self.run_task, 10)

    async def test_the_shortest_honest_game_fits_one_session(self):
        for thing in ('plaque', 'power', 'door', 'hatch'):
            await self.west({'type': 'inspect', 'id': thing})
        await self.speak(('inspect', 'hatch'), ('inspect', 'gate'))
        await self.west_button({'type': 'share', 'id': 'interlock'})
        await self.speak(('action', 'send-key'))
        view = (await self.west({'type': 'inspect', 'id': 'hatch'}))['view']
        await self.west_button({'type': 'accept', 'id': view['pending']['id']})
        await self.west_button({'type': 'action', 'id': 'unlock'})
        await self.west_button({'type': 'action', 'id': 'power-on'})
        await self.speak(('inspect', 'brake'), ('action', 'hold-brake'))
        await self.west_button({'type': 'share', 'id': 'coupling'})
        await self.west_button({'type': 'action', 'id': 'power-off'})
        await self.type('我提了断电，你确认一下。', ('accept', None))
        await self.speak(('inspect', 'fan'), ('action', 'brace'))
        await self.speak(('action', 'release-brake'))
        await self.west_button({'type': 'action', 'id': 'open-door'})
        await self.speak(('accept', None))
        await self.speak(('action', 'leave'))

        final = await asyncio.to_thread(self.post, '/command', self.tokens['west'], {'type': 'inspect', 'id': 'door'})
        self.assertTrue(final['view']['complete'], 'both players should be outside')
        self.assertIsNone(self.closed(), 'the session must still be open when the game is won')
        row = self.session.ledger.row
        self.assertEqual(row['tools'], 22)
        # The shortest game must leave room for a real one: detours, repeats and small talk.
        used = {k: row[k] / row['limits'][k] for k in ('input_seconds', 'output_seconds', 'turns', 'tools', 'text_bytes')}
        used['usage_stop_usd'] = row['estimated_usd'] / row['limits']['usage_stop_usd']
        self.assertLess(max(used.values()), .5, used)
        self.assertEqual(self.live.audio_in, 7 * PLAYER_SECONDS * 32000)

        await asyncio.to_thread(self.post, '/live-input', self.tokens['west'], {'type': 'stop'})
        await asyncio.wait_for(self.run_task, 10)
        self.assertEqual(self.closed(), 'user_stop')
        print('\nwhole game, share of each session cap used:', {k: round(v, 3) for k, v in used.items()}, file=sys.stderr)


if __name__ == '__main__':
    unittest.main()
