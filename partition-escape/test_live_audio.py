"""Which reply audio reaches the player. Offline: the production input and receive loops run
against a scripted provider session (live_scripted.py) and a pipe that stands in for stdin.

Seen in a real session on 2026-11-25 (room 2e92…, attempt 3): the player spoke at 25.9 s and
again at 27.1 s, the provider reported no interruption, and the reply that completed at 35.4 s
was never played.
"""
import asyncio
import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from live_budget import Ledger
from live_scripted import ScriptedLive, audio, content, message
from live_updates import ContextUpdates
from live_worker import Session


class ReplyAudio(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        s = Session.__new__(Session)
        s.fixture = False
        s.api = SimpleNamespace(url='http://127.0.0.1/api/rooms/room')
        s.root = Path(self.temp.name)
        s.seat = 'east'; s.scope = 'scope-0'; s.epoch = 0
        s.ledger = Ledger(Path(self.temp.name) / 'fixture-ledger', fixture=True)
        s.ledger.reserve()
        self.addCleanup(s.ledger.close)
        s.closed = asyncio.Event(); s.reason = 'closed'
        s.speaking = False; s.drop_audio = False; s.turn_open = False; s.generating = False
        s.calls = {}; s.canceled = set(); s.tool_queue = asyncio.Queue()
        s.public = []; s.started = time.monotonic(); s.tool_busy = False; s.updates = ContextUpdates(s)
        self.live = s.session = ScriptedLive()
        self.session = s
        self.events = []
        read, write = os.pipe()
        self.stdin = os.fdopen(read, 'rb', buffering=0)
        self.pipe = os.fdopen(write, 'wb', buffering=0)
        self.addCleanup(self.pipe.close)
        for p in (patch('live_worker.emit', self.events.append), patch('live_worker.write_public_index'),
                  patch('sys.stdin', self.stdin)):
            p.start()
            self.addCleanup(p.stop)
        self.tasks = [asyncio.create_task(s.input_loop()), asyncio.create_task(s.receive_loop())]
        self.addAsyncCleanup(self.finish)

    async def finish(self):
        self.session.closed.set()
        for task in self.tasks:
            task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        self.stdin.close()

    async def settle(self):
        for _ in range(40):
            await asyncio.sleep(.005)
            failed = [t for t in self.tasks if t.done() and not t.cancelled() and t.exception()]
            if failed:
                raise failed[0].exception()

    async def player(self, kind, **fields):
        if kind in ('start', 'text'):
            self.session_epoch = getattr(self, 'session_epoch', 0) + 1
            fields = {'scope': f'scope-{self.session_epoch}', 'epoch': self.session_epoch, **fields}
        self.pipe.write((json.dumps({'type': kind, **fields}) + '\n').encode())
        await self.settle()

    async def provider(self, *messages):
        for m in messages:
            await self.live.out.put(m)
        await self.settle()

    def played(self):
        return len([e for e in self.events if e.get('type') == 'audio'])

    async def utterance(self):
        await self.player('start')
        await self.player('end')

    async def test_a_reply_to_one_utterance_is_played(self):
        await self.utterance()
        await self.provider(audio(1), message(server_content=content(turn_complete=True)))
        self.assertEqual(self.played(), 1)

    async def test_a_second_sentence_before_the_reply_does_not_mute_the_reply(self):
        await self.utterance()
        await self.utterance()  # the model has produced nothing yet, so the provider interrupts nothing
        await self.provider(audio(1), audio(1), message(server_content=content(turn_complete=True)))
        self.assertEqual(self.played(), 2, 'the reply to the second sentence was dropped')

    async def test_typing_while_waiting_for_a_reply_does_not_mute_the_reply(self):
        await self.utterance()
        await self.player('text', text='先等等')
        await self.provider(audio(1), message(server_content=content(turn_complete=True)))
        self.assertEqual(self.played(), 1, 'the reply after a typed message was dropped')

    async def test_talking_over_the_partner_drops_only_the_interrupted_turn(self):
        await self.utterance()
        await self.provider(audio(1))                    # the partner is answering
        self.assertEqual(self.played(), 1)
        await self.player('start')                       # the player talks over it
        await self.provider(audio(1))                    # a chunk already on the wire: stale
        self.assertEqual(self.played(), 1)
        await self.player('end')
        await self.provider(audio(1))                    # still the old turn until the provider says so
        self.assertEqual(self.played(), 1)
        await self.provider(message(server_content=content(interrupted=True)))
        await self.provider(audio(1), message(server_content=content(turn_complete=True)))
        self.assertEqual(self.played(), 2, 'the new reply after an interruption was dropped')

    async def test_typing_over_the_partner_drops_the_rest_of_the_old_turn(self):
        await self.utterance()
        await self.provider(audio(1))
        await self.player('text', text='先等等')
        await self.provider(audio(1))
        self.assertEqual(self.played(), 1)
        await self.provider(message(server_content=content(turn_complete=True)))
        await self.provider(audio(1), message(server_content=content(turn_complete=True)))
        self.assertEqual(self.played(), 2)


if __name__ == '__main__':
    unittest.main()
