"""A REAL Gemini Live session played by typed lines. No microphone is opened.

    This spends ONE connection of the local grant (.live) and real provider usage.
    Run it only when the project owner has said so.

The script is the west player's hands: it uses the same loopback HTTP API as the page, presses
west's buttons, and tells the partner what to do in typed lines, which the server forwards into
the session as text. The partner answers in audio; what it said comes back as the provider's own
transcription. Nothing here can make the partner act: every east action is the model's tool call
through the normal ticket gate and rules.

It checks what a fixture cannot: the provider path, a session longer than a minute, tool calls
with real receipts, and whether a whole game fits in one session. It does not check the
microphone, the local voice detection or echo; only a person at the page can.

Writes result.json (no audio payloads) and partner.wav (the partner's voice only) under --out.
"""
import argparse
import base64
import json
import queue
import threading
import time
import wave
from pathlib import Path

import httpx

TURN_TIMEOUT = 60      # seconds to wait for the partner to finish a turn
STOP_MARGIN = 20       # stop this long before the session's own cap


class Player:
    def __init__(self, origin, out, fixture=False, turn_timeout=TURN_TIMEOUT, scenario='dictated'):
        self.scenario = scenario
        self.fixture = fixture
        self.turn_timeout = turn_timeout
        self.out = Path(out)
        self.out.mkdir(parents=True, exist_ok=True)
        self.origin = origin
        self.http = httpx.Client(base_url=origin, timeout=15, trust_env=False, headers={'Origin': origin})
        room = self.http.post('/api/rooms', json={'controllers': {'west': 'human', 'east': 'live'}})
        room.raise_for_status()
        room = room.json()
        self.room = room['id']
        self.path = '/api/rooms/' + self.room
        self.auth = {'Authorization': 'Bearer ' + room['links']['west'].split('key=')[1]}
        self.watch = {'Authorization': 'Bearer ' + room['links']['watch'].split('key=')[1]}
        self.events = []
        self.queue = queue.Queue()
        self.started = None
        self.pcm = bytearray()
        self.turns = 0
        self.closed = None
        self.steps = []
        self.stop_beat = threading.Event()

    # --- plumbing ----------------------------------------------------------
    def at(self):
        return round(time.monotonic() - self.started, 2) if self.started else 0

    def view(self):
        return self.http.get(self.path, headers=self.auth).json()

    def live(self, suffix, body):
        r = self.http.post(self.path + '/live-' + suffix, json=body, headers=self.auth)
        r.raise_for_status()
        return r.json()

    def read(self, ready, seconds):
        try:
            with httpx.stream('GET', self.origin + self.path + '/live-stream', headers=self.auth,
                              timeout=httpx.Timeout(10, read=seconds + 60), trust_env=False) as r:
                r.raise_for_status()
                ready.set()
                for line in r.iter_lines():
                    if line:
                        self.queue.put(json.loads(line))
        except Exception as error:  # the stream ending is itself a result worth recording
            self.queue.put({'type': 'reader_error', 'class': type(error).__name__})

    def beat(self):
        while not self.stop_beat.wait(2):
            try:
                self.live('input', {'type': 'heartbeat'})
            except httpx.HTTPError:
                return

    def drain(self, until=None, timeout=0):
        """Record what arrived. With `until`, wait for the first event it accepts."""
        deadline = time.monotonic() + timeout
        while True:
            try:
                event = self.queue.get(timeout=.1 if until else 0)
            except queue.Empty:
                if not until or time.monotonic() > deadline or self.closed:
                    return None
                continue
            if event['type'] == 'audio':
                raw = base64.b64decode(event['data'])
                self.pcm += raw
                event = {k: v for k, v in event.items() if k != 'data'} | {'pcm_bytes': len(raw)}
            event['at'] = self.at()
            self.events.append(event)
            if event['type'] == 'turn_complete':
                self.turns += 1
            if event['type'] in ('closed', 'reader_error'):
                self.closed = event.get('reason') or event['type']
            if until and until(event):
                return event

    # --- the player's moves ------------------------------------------------
    def button(self, command):
        result = self.http.post(self.path + '/command', json=command, headers=self.auth).json()
        self.events.append({'type': 'west_button', 'at': self.at(), 'command': command,
                            'ok': result.get('ok'), 'receipt': result.get('receipt')})
        self.drain()
        return result

    def tell(self, text):
        """One typed line to the partner; returns once the partner has finished its turn."""
        mark = len(self.events)
        done = self.turns
        sent = self.at()
        self.button({'type': 'say', 'text': text})
        self.drain(lambda e: e['type'] == 'turn_complete' and self.turns > done, self.turn_timeout)
        mine = self.events[mark:]
        first = lambda kind: next((e['at'] for e in mine if e['type'] == kind), None)
        heard = ''.join(e['text'] for e in mine if e['type'] == 'transcript' and e.get('speaker') == 'partner')
        tools = [(e['receipt'] or {}).get('command') + ' → ' + (e['receipt'] or {}).get('outcome')
                 for e in mine if e['type'] == 'tool' and e.get('receipt')]
        return {'said': text, 'sent_at': sent, 'first_tool_s': first('tool') and round(first('tool') - sent, 2),
                'first_audio_s': first('audio') and round(first('audio') - sent, 2),
                'turn_s': round(self.at() - sent, 2) if self.turns > done else None,
                'partner_said': heard, 'receipts': tools,
                'audio_s': round(sum(e['pcm_bytes'] for e in mine if e['type'] == 'audio') / 48000, 2)}

    def step(self, name, lines, reached):
        """Say the lines in order until `reached(view)` holds. Returns whether it did."""
        record = {'step': name, 'tries': []}
        self.steps.append(record)
        for line in lines:
            if self.closed:
                break
            record['tries'].append(self.tell(line))
            if reached(self.view()):
                record['reached'] = True
                print(f"  {self.at():6.1f}s  {name}: done after {len(record['tries'])} line(s)", flush=True)
                return True
        record['reached'] = False
        print(f"  {self.at():6.1f}s  {name}: NOT reached", flush=True)
        return False

    # --- the session -------------------------------------------------------
    def play(self):
        status = self.http.get(self.path + '/live-status', headers=self.auth).json()
        if not self.fixture and (not status.get('runtimeReady') or not status.get('remaining') or status.get('projectVerified') is False):
            raise SystemExit(f"not started, no connection spent: runtime={status.get('runtimeCode')} "
                             f"remaining={status.get('remaining')} projectVerified={status.get('projectVerified')}")
        seconds = status['seconds']
        ready = threading.Event()
        threading.Thread(target=self.read, args=(ready, seconds), daemon=True).start()
        if not ready.wait(10):
            raise SystemExit('not started, no connection spent: the local stream did not open')
        for thing in ('plaque', 'power', 'door', 'hatch'):
            self.button({'type': 'inspect', 'id': thing})
        self.live('start', {'fixture': self.fixture})
        self.started = time.monotonic()
        threading.Thread(target=self.beat, daemon=True).start()
        print(f"room {self.room}: connection requested, cap {seconds}s", flush=True)
        if not self.drain(lambda e: e['type'] == 'ready', 30):
            return self.finish(status, 'the provider never became ready')
        print(f"  {self.at():6.1f}s  ready", flush=True)
        plan = getattr(self, 'plan_' + self.scenario.replace('-', '_'))()
        problem = None
        for name, lines, reached, then in plan:
            if self.at() > seconds - STOP_MARGIN:
                problem = 'out of time before ' + name
                break
            if not self.step(name, lines, reached):
                problem = self.closed and f'session ended ({self.closed}) at ' + name or name + ' not reached'
                break
            if then:
                then()
        return self.finish(status, problem)

    def take_key(self):
        pending = self.view()['pending']
        self.button({'type': 'accept', 'id': pending['id']})
        self.button({'type': 'action', 'id': 'unlock'})
        self.button({'type': 'action', 'id': 'power-on'})

    def public(self):
        return self.http.get(self.path, headers=self.watch).json()['public']

    # --- who the player is -------------------------------------------------
    # Each plan is a list of (name, lines to try in order, reached(view), what west does next).
    def plan_dictated(self):
        """A player who knows the whole solution and dictates every east step in the right order.
        It proves the provider path and the rules; it does not show that the partner can play."""
        signal = lambda name: lambda v: name in v.get('signals', {})
        return [
            ('key offered', ['你好，我在西间。请先查看你那边的传物槽，然后把黄铜钥匙递给我。',
                             '请用工具递出钥匙：先 observe，再对传物槽执行 send-key。',
                             '请现在递出黄铜钥匙。'],
             lambda v: (v.get('pending') or {}).get('action') == 'send-key', self.take_key),
            ('brake held', ['钥匙我接到了，门锁开了，动力也接通了，你那边的闸门应该升起来了。请拉住手闸。',
                            '请现在拉住手闸，把闸门固定住。', '请执行 hold-brake。'],
             signal('hold-brake'), lambda: self.button({'type': 'action', 'id': 'power-off'})),
            ('power-off confirmed', ['我提了一个共同动作：切断动力。你拉着手闸，闸门不会落下。请确认这个提议。',
                                     '请接受我提出的切断动力。', '请对当前的提议执行 accept。'],
             lambda v: v['local']['power'] is False and not v.get('pending'), None),
            ('brace fitted', ['动力断了，风扇应该停了。请查看检修风扇，把后面的木撑取出来装好。',
                              '请现在取出并安装木撑。', '请执行 brace。'],
             signal('brace'), None),
            ('brake released', ['很好。请松开手闸，看看木撑能不能撑住闸门。',
                                '请现在松开手闸。', '请执行 release-brake。'],
             signal('release-brake'), lambda: self.button({'type': 'action', 'id': 'open-door'})),
            ('door confirmed', ['我提了一个共同动作：推开西门。请确认这个提议。',
                                '请接受我提出的推开西门。', '请对当前的提议执行 accept。'],
             lambda v: v['local']['doorOpen'] is True, None),
            ('both outside', ['西门开了。请走向共同出口，我们一起出去。',
                              '请现在走向共同出口。', '请执行 leave。'],
             lambda v: v.get('complete') is True, None),
        ]

    def plan_proposal_first(self):
        """The order a person plays in: propose cutting the power first, then ask the partner to get
        ready. On 2026-11-26 a person's game stopped here: the waiting proposal froze the partner's
        own controls, so it could not hold the gate before confirming. Stops after that exchange."""
        def key_then_propose():
            self.take_key()
            self.button({'type': 'action', 'id': 'power-off'})
        held_through = lambda v: v['local']['power'] is False and not v.get('pending') and self.public()['gateOpen'] is True
        return [
            ('key offered', ['你好，我在西间。请把你那边的黄铜钥匙递给我。', '请现在递出黄铜钥匙。'],
             lambda v: (v.get('pending') or {}).get('action') == 'send-key', key_then_propose),
            ('power cut with the gate still up',
             ['钥匙我接到了，门锁开了，动力也接通了，你那边的闸门应该升起来了。我已经提了切断动力，你那边准备好了再确认。',
              '断电后你那边的闸门不能落下来。你先把它固定住，再确认我的提议。',
              '请先拉住手闸，再确认切断动力。',
              '现在卡在哪里？你刚才想做什么，为什么没做成？'],
             held_through, None),
        ]

    def plan_west_only(self):
        """A player who knows only what the west room shows. No line names an east object or action:
        the partner has to know its own room. The checks know the solution; the lines do not."""
        signal = lambda name: lambda v: name in v.get('signals', {})
        def key_and_power():
            pending = self.view()['pending']
            self.button({'type': 'accept', 'id': pending['id']})
            self.button({'type': 'action', 'id': 'unlock'})
            for clue in ('interlock', 'coupling'):
                self.button({'type': 'share', 'id': clue})
            self.button({'type': 'action', 'id': 'power-on'})
        return [
            ('key offered', ['你好，我在西间。我这边有一块出口铭牌、一个动力台、一扇上了锁的西门和一个传物槽。西门要一把黄铜钥匙才能开，我这边没有。你那边有什么？',
                             '你那边有钥匙的话，能递给我吗？', '请把钥匙从传物槽递过来。'],
             lambda v: (v.get('pending') or {}).get('action') == 'send-key', key_and_power),
            ('gate held', ['钥匙收到了，门锁也开了。我把动力接通了，说明上写着它同时带动你那边的升降闸和风扇。铭牌还说，西门一推开动力就会断，要两个人一起走。你那边现在什么情况？断电的话你那边会怎样，要先做什么准备？',
                           '如果我这边断电，你那边的闸门会不会落下来？你能先把它固定住吗？',
                           '你那边有没有办法让闸门在断电后还开着？有的话请先做。'],
             signal('hold-brake'), lambda: self.button({'type': 'action', 'id': 'power-off'})),
            ('power-off confirmed', ['我提了切断动力，你那边准备好了就确认。', '切断动力的提议还在等你。你准备好了吗？还差什么？',
                                     '请确认切断动力。'],
             lambda v: v['local']['power'] is False and not v.get('pending') and self.public()['gateOpen'] is True, None),
            ('gate stays up by itself', ['动力断了。你那边还要做什么，才能腾出手和我一起离开？', '你现在能走开吗？还差什么？',
                                         '你那边有没有东西可以代替你撑住闸门？', '现在情况怎么样？'],
             # Letting go of the brake is not a step of its own: walking out lets go of it.
             signal('brace'), lambda: self.button({'type': 'action', 'id': 'open-door'})),
            ('door confirmed', ['我提了推开西门，你那边准备好了就确认。', '推开西门的提议还在等你，你准备好了吗？', '请确认推开西门。'],
             lambda v: v['local']['doorOpen'] is True, None),
            ('both outside', ['门开了，我们一起走吧。', '你可以出来了吗？', '我们一起出去吧。'],
             lambda v: v.get('complete') is True, None),
        ]

    def finish(self, status, problem):
        if not self.closed:
            try:
                self.live('input', {'type': 'stop'})
            except httpx.HTTPError:
                pass
            self.drain(lambda e: e['type'] == 'closed', 10)
        self.stop_beat.set()
        public = self.http.get(self.path, headers=self.watch).json()
        after = self.http.get(self.path + '/live-status', headers=self.auth).json()
        usage = [e['estimatedUsd'] for e in self.events if e['type'] == 'usage']
        audit = next((e.get('audit') for e in self.events if e['type'] == 'closed' and e.get('audit')), None)
        result = {'source': 'offline-fixture rehearsal of this script, no model' if self.fixture else
                  'real-gemini-live, typed lines, no microphone', 'scenario': self.scenario, 'room': self.room,
                  'complete': public.get('complete'), 'problem': problem, 'closed': self.closed,
                  'elapsed_s': self.at(), 'turns': self.turns, 'partner_audio_s': round(len(self.pcm) / 48000, 2),
                  'estimated_usd': usage[-1] if usage else None, 'audit': audit,
                  'limits': {k: status.get(k) for k in ('seconds', 'inputSeconds', 'outputSeconds', 'usageStopUsd')},
                  'connections_before': status.get('remaining'), 'connections_after': after.get('remaining'),
                  'sync': after.get('sync'), 'steps': self.steps, 'public': public.get('public'), 'events': self.events}
        (self.out / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
        with wave.open(str(self.out / 'partner.wav'), 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(24000)
            w.writeframes(bytes(self.pcm))
        print(json.dumps({k: result[k] for k in ('room', 'complete', 'problem', 'closed', 'elapsed_s', 'turns',
                                                 'partner_audio_s', 'estimated_usd', 'connections_before',
                                                 'connections_after')}, ensure_ascii=False), flush=True)
        return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--origin', default='http://127.0.0.1:4174')
    parser.add_argument('--out', required=True)
    parser.add_argument('--spend-one-connection', action='store_true',
                        help='required: says the project owner approved one real connection')
    parser.add_argument('--fixture', action='store_true',
                        help="rehearse this script's plumbing against a server started with PARTITION_LIVE_FIXTURE=1: no model, nothing spent")
    parser.add_argument('--turn-timeout', type=float, default=TURN_TIMEOUT)
    parser.add_argument('--scenario', choices=('dictated', 'proposal-first', 'west-only'), default='dictated',
                        help='who the player is: one who dictates every step, one who proposes before the partner is ready, '
                             'or one who knows only the west room')
    arguments = parser.parse_args()
    if not arguments.spend_one_connection and not arguments.fixture:
        raise SystemExit('refused: this makes a real Gemini Live connection. Pass --spend-one-connection '
                         'once the project owner has approved it, or --fixture to rehearse offline.')
    Player(arguments.origin, arguments.out, arguments.fixture, arguments.turn_timeout, arguments.scenario).play()
