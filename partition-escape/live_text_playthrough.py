"""A REAL Gemini Live session played by typed lines. No microphone is opened.

    This spends ONE connection of the local grant (.live) and real provider usage.
    Run it only when the project owner has said so.

The script is the west player's hands: it uses the same loopback HTTP API as the page, presses
west's buttons, and talks to the partner in typed lines, which the server forwards into the
session as text. The player knows only what the west room shows and proposes the power cut before
the partner has done anything about the gate, as a person does. The partner answers in audio; what it said comes back as the provider's own
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
import re
import threading
import time
import wave
from pathlib import Path

import httpx

TURN_TIMEOUT = 60      # seconds to wait for the partner to finish a turn
STOP_MARGIN = 20       # stop this long before the session's own cap


def chart_of(view):
    """What the west room says about supports: the gate's weight, the tags the table has a column
    for, and each mark's rating under each tag. Read from the player's own notes, nothing else."""
    notes = {n['object']: n for n in view['notes']}
    weight = int(re.search(r'自重 (\d+) 公斤', notes['plaque']['text']).group(1))
    table = notes['chart']['table']
    tags = [column.removesuffix('牌') for column in table['columns'][1:]]
    return weight, tags, {row[0]: dict(zip(tags, row[1:])) for row in table['rows']}


def tag_heard(said, tags):
    """The one tag colour the partner named in a reply, or None when it named none or more than one.
    The colour has to come as a colour ("黄色", "黄牌", "黄的"): the brass key is "黄铜" and is not a tag."""
    named = [tag for tag in tags if any(tag + end in said for end in ('色', '牌', '的'))]
    return named[0] if len(named) == 1 else None


class Player:
    def __init__(self, origin, out, fixture=False, turn_timeout=TURN_TIMEOUT):
        self.fixture = fixture
        self.turn_timeout = turn_timeout
        self.out = Path(out)
        self.out.mkdir(parents=True, exist_ok=True)
        self.origin = origin
        self.http = httpx.Client(base_url=origin, timeout=15, trust_env=False, headers={'Origin': origin})
        room = self.http.post('/api/rooms', json={'controllers': {'west': 'human', 'east': 'live'}})
        if room.status_code != 201:
            raise SystemExit(f'not started, no connection spent: the room was refused ({room.text.strip()})')
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
        # A step's lines may depend on what an earlier step learned.
        for line in (lines() if callable(lines) else lines):
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
        # Look at everything in the west room first, as a player does.
        for thing in self.view()['scene']:
            self.button({'type': 'inspect', 'id': thing['id']})
        self.live('start', {'fixture': self.fixture})
        self.started = time.monotonic()
        threading.Thread(target=self.beat, daemon=True).start()
        print(f"room {self.room}: connection requested, cap {seconds}s", flush=True)
        if not self.drain(lambda e: e['type'] == 'ready', 30):
            return self.finish(status, 'the provider never became ready')
        print(f"  {self.at():6.1f}s  ready", flush=True)
        plan = self.plan()
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

    def public(self):
        return self.http.get(self.path, headers=self.watch).json()['public']

    # --- who the player is -------------------------------------------------
    # A list of (name, lines to try in order, reached(view), what west does next).
    def plan(self):
        """Someone who knows only the west room and proposes the power cut first. The player has
        the table and the gate's weight; which column counts and which supports fit it has to hear
        from the partner. It decides each support the partner offers by its own sum, and never
        reads the answer from the server."""
        signal = lambda name: lambda v: name in v.get('signals', {})
        def key_power_propose():
            pending = self.view()['pending']
            self.button({'type': 'accept', 'id': pending['id']})
            self.button({'type': 'action', 'id': 'unlock'})
            self.button({'type': 'action', 'id': 'power-on'})
            self.button({'type': 'action', 'id': 'power-off'})
        known = {}
        def tag():
            # Once heard, the tag is kept: the partner naming another colour later in passing
            # (a column of the table, say) must not unlearn it.
            if 'tag' not in known:
                _, tags, _ = chart_of(self.view())
                # The latest reply that names exactly one colour: a reply that named two is asked about again.
                replies = [t['partner_said'] for s in self.steps for t in s['tries']]
                heard = next((tag_heard(reply, tags) for reply in reversed(replies) if tag_heard(reply, tags)), None)
                if heard is None:
                    return None
                known['tag'] = heard
            return known['tag']
        def strong_enough(mark):
            weight, _, table = chart_of(self.view())
            return table[mark][tag()] >= weight
        def which():
            weight, _, table = chart_of(self.view())
            enough = [mark for mark, by_tag in table.items() if by_tag[tag()] >= weight]
            return [f'你说是{tag()}牌。按我这张表{tag()}牌那一列，承重够得上闸重的只有刻着{"、".join(enough)}的支撑，别的都不够。'
                    '其中放得进槽的那一根，请你提议装上，我来确认。',
                    '我没同意刚才那根：按表它承不住。请换一根放得进槽、承重也够的。',
                    '装支撑的提议我还没有看到。你那边还差什么？', '请提议装上那根放得进槽、承重也够的支撑。']
        # A partner that is quick offers a support in the same turn in which it confirms the power cut.
        offered = lambda v: bool(v.get('pending')) and v['pending']['from'] == 'east' and v['pending']['action'].startswith('brace-')
        def decided(view):
            pending = view.get('pending')
            if offered(view):
                mark = re.fullmatch(r'装上刻着(.+)的支撑', pending['label']).group(1)
                self.button({'type': 'accept' if strong_enough(mark) else 'decline', 'id': pending['id']})
                view = self.view()
            return any(name.startswith('brace-') for name in view.get('signals', {}))
        return [
            ('key offered', ['你好，我在西间。我这边有出口铭牌、动力台、上了锁的西门、传物槽，还有一张承重表。西门要一把黄铜钥匙才能开，你那边有的话请递给我。',
                             '你那边有钥匙吗？能递给我吗？', '请把钥匙从传物槽递过来。'],
             lambda v: (v.get('pending') or {}).get('action') == 'send-key', key_power_propose),
            ('power cut with the gate still up', ['钥匙收到了，门锁开了，我也接通了动力。备用电池只有两格，所以我已经提了切断动力，你那边准备好了再确认。',
                                                  '断电后你那边的闸门不能落下来。你先把它固定住，再确认我的提议。', '切断动力的提议还在等你，你准备好了吗？还差什么？'],
             lambda v: v['local']['power'] is False and (not v.get('pending') or offered(v)) and self.public()['gateOpen'] is True, None),
            ('tag learned', ['动力断了。我这边墙上有一张承重表，按支撑上刻的记号查承重，分几列，读哪一列要看你那边闸轨上检修牌的颜色。那块牌子是什么颜色？',
                             '你那边闸轨上的检修牌是什么颜色？', '请只告诉我检修牌的颜色。'],
             lambda v: tag() is not None, None),
            ('support in the slot', which, decided, None),
            ('support holds', ['支撑装上了。请松手试一试，看它承不承得住。', '你松手了吗？支撑承住了吗？', '现在闸门还开着吗？'],
             lambda v: 'release-brake' in v.get('signals', {}) and self.public()['gateOpen'] is True,
             lambda: self.button({'type': 'action', 'id': 'open-door'})),
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
                  'real-gemini-live, typed lines, no microphone', 'room': self.room,
                  'complete': public.get('complete'), 'rating': public.get('rating'), 'problem': problem, 'closed': self.closed,
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
        print(json.dumps({k: result[k] for k in ('room', 'complete', 'rating', 'problem', 'closed', 'elapsed_s', 'turns',
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
    arguments = parser.parse_args()
    if not arguments.spend_one_connection and not arguments.fixture:
        raise SystemExit('refused: this makes a real Gemini Live connection. Pass --spend-one-connection '
                         'once the project owner has approved it, or --fixture to rehearse offline.')
    Player(arguments.origin, arguments.out, arguments.fixture, arguments.turn_timeout).play()
