import json
import os
import sys
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from live_trace import write


class TraceSegmentsTest(unittest.TestCase):
    def test_numbered_segments_keep_only_their_own_public_receipts(self):
        def record(request_id, event_id):
            return {'events': [
                {'source': 'rules', 'kind': 'tool_result', 'call_alias': 'test-call', 'at_ms': 5,
                 'receipt': {'command': '查看机关', 'outcome': 'recorded',
                             'roomEventIds': [event_id], 'requestId': request_id}},
                {'source': 'rules', 'kind': 'closed', 'reason': 'user_stop'},
            ], 'private': 'must-never-render'}

        with TemporaryDirectory() as tmp:
            base = Path(tmp) / 'room' / 'east'
            second = base / 'sessions' / '1'
            second.mkdir(parents=True)
            first_data = record('first-request', 12)
            (base / 'live-public.json').write_text(json.dumps(first_data))
            write(base, first_data, 'room', 'east')
            first_page = (base / 'live-studio.html').read_text()
            write(second, record('second-request', 14), 'room', 'east')
            second_page = (second / 'live-studio.html').read_text()
            history_start = second_page.index('<details>')
            history_end = second_page.index('</details>')
            history = second_page[history_start:history_end]
            self.assertIn('第 1 段', first_page)
            self.assertIn('第 2 段', second_page)
            self.assertIn('第 1 段', history)
            self.assertIn('first-request', history)
            self.assertIn('#12', history)
            self.assertNotIn('second-request', history)
            self.assertIn('second-request', second_page[history_end:])
            self.assertIn('#14', second_page[history_end:])
            self.assertNotIn('first-request', second_page[history_end:])
            self.assertNotIn('must-never-render', second_page)
            self.assertEqual((base / 'live-studio.html').read_text(), first_page)


    def test_key_handoff_unsent_then_a_new_receipt_in_same_room(self):
        # Generate actual game receipts. The transport status below is the offline
        # failure case at the worker boundary; this test never starts Gemini.
        game = """
          import assert from 'node:assert/strict';
          import {Room} from './world.mjs';
          import {LiveHub} from './live.mjs';
          const room = new Room({west:'human', east:'live'});
          const live = new LiveHub('.', 'http://127.0.0.1', false);
          const first = room.command('east', {type:'action',id:'send-key'}).receipt;
          assert.equal(first.outcome, 'proposed');
          live.stop(room, 'tab_hidden');
          assert.equal(room.view('west').local.keyHere, false);
          const accepted = room.command('west', {type:'accept',id:room.pending.id}).receipt;
          assert.equal(accepted.outcome, 'applied');
          assert.equal(live.renew(room), 1);
          assert.equal(room.view('west').local.keyHere, true);
          assert.equal(room.command('west', {type:'action',id:'power-on'}).ok, true);
          const second = room.command('east', {type:'action',id:'hold-brake'}).receipt;
          assert.equal(second.outcome, 'applied');
          console.log(JSON.stringify({room:room.id, first, accepted, second}));
        """
        proc = subprocess.run(['node', '--input-type=module', '-e', game],
                              cwd=Path(__file__).parent, capture_output=True, text=True, check=True)
        run = json.loads(proc.stdout)
        first, accepted, second = (run[k] for k in ('first', 'accepted', 'second'))
        self.assertLess(max(first['roomEventIds']), min(accepted['roomEventIds']))
        self.assertLess(max(accepted['roomEventIds']), min(second['roomEventIds']))

        def result(receipt):
            return {'kind':'tool_result', 'source':'rules', 'at_ms':5,
                    'call_alias':'same-alias', 'receipt':receipt}

        def response(alias, execution, delivery, reason):
            return {'kind':'tool_response', 'source':'rules', 'tool':'seat_command',
                    'call_alias':alias, 'execution':execution, 'delivery':delivery, 'reason':reason}

        data1 = {'events': [
            result(first), response('same-alias', 'engine_receipt', 'not_sent', 'session_closed'),
            response('no-engine-receipt', 'not_executed', 'not_sent', 'live_tools_limit_before_execution'),
            {'kind':'closed', 'source':'rules', 'reason':'tab_hidden'},
        ]}
        data2 = {'events': [
            result(second), response('same-alias', 'engine_receipt', 'transport_sent', 'transport_return_only'),
        ]}
        with TemporaryDirectory() as tmp:
            base = Path(tmp) / run['room'] / 'east'
            folder = base / 'sessions' / '1'
            folder.mkdir(parents=True)
            (base / 'live-public.json').write_text(json.dumps(data1))
            write(folder, data2, run['room'], 'east')
            html = (folder / 'live-studio.html').read_text()
        history, current = html.split('</details>', 1)
        row = next(row for row in history.split('<tr>') if first['requestId'] in row).split('</tr>')[0]
        for value in ['proposed', first['command'], 'not_sent', 'session_closed', 'engine_receipt']:
            self.assertIn(value, row)
        for event_id in first['roomEventIds']:
            self.assertIn(f'#{event_id}<', row)
        self.assertNotIn('transport_sent', row)
        gate = next(li for li in history.split('<li>') if 'no-engine-receipt' in li).split('</li>')[0]
        self.assertIn('not_executed', gate)
        self.assertIn('live_tools_limit_before_execution', gate)
        self.assertNotIn(second['requestId'], history)
        self.assertNotIn(first['requestId'], current)
        self.assertNotIn(accepted['requestId'], html)  # Human acceptance is not a model call.
        self.assertIn(second['requestId'], current)
        self.assertIn('<td>applied</td>', current)
        self.assertIn('（transport_sent）</td>', current)

    def test_repaired_history_is_reread_in_the_same_process(self):
        with TemporaryDirectory() as tmp:
            base = Path(tmp) / 'room' / 'east'
            folder = base / 'sessions' / '1'
            folder.mkdir(parents=True)
            old = base / 'live-public.json'
            current = {'events': []}
            for bad in [None, '{', '{"events": null}']:
                if bad is not None:
                    old.write_text(bad)
                write(folder, current, 'room', 'east')
                self.assertIn('无可读记录', (folder / 'live-studio.html').read_text())
            old.write_text(json.dumps({'events':[{'source':'offline-fixture', 'kind':'closed',
                                                  'reason':'fixture_end'}]}))
            # Even a completed worker's saved HTML may contain an old placeholder.
            (folder / 'live-public.json').write_text(json.dumps(current))
            read = """
              import {LiveHub} from './live.mjs';
              import {Room} from './world.mjs';
              const room = new Room({west:'human',east:'live'});
              room.id='room';
              const hub=new LiveHub(process.cwd(),'http://127.0.0.1',false);
              process.stdout.write(await hub.tracePage(room,'east',process.argv[1]));
            """
            proc = subprocess.run(['node','--input-type=module','-e',read,str(folder)],
                                  cwd=Path(__file__).parent, capture_output=True, text=True, check=True,
                                  env={'PATH':os.environ['PATH'], 'PARTITION_PYTHON':sys.executable})
            self.assertNotIn('无可读记录', proc.stdout)
            self.assertIn('fixture_end', proc.stdout)
            self.assertIn('无可读记录', (folder / 'live-studio.html').read_text())
            write(folder, current, 'room', 'east')
            history = (folder / 'live-studio.html').read_text().split('</details>')[0]
            self.assertNotIn('无可读记录', history)
            self.assertIn('第 1 段 · 离线 fixture', history)
            self.assertIn('fixture_end', history)

    def test_duplicate_response_cannot_relabel_the_original_execution(self):
        from live_trace import result_deliveries
        result = {'kind':'tool_result','call_alias':'same'}
        unsent = {'kind':'tool_response','call_alias':'same','execution':'engine_receipt','delivery':'not_sent'}
        duplicate = {'kind':'tool_response','call_alias':'same','execution':'not_executed_duplicate',
                     'delivery':'transport_sent'}
        self.assertEqual(result_deliveries([result, unsent, duplicate]), {0:unsent})
        self.assertEqual(result_deliveries([result, duplicate]), {})
