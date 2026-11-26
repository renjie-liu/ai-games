"""Where the session caps come from, and that changing them does not void a grant. Offline."""
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import live_budget
from live_budget import Ledger, LIMITS, SESSION, UPDATES, load_limits, merge_limits, quota_status

ROOT = Path(__file__).resolve().parent
DEFAULTS = json.loads((ROOT / 'live-limits.json').read_text())

# The ledger of the first human playtest (2026-11-25) as it was written: a count grant of 50
# under the caps of that day. Its `limits` no longer match what one session may use now.
EARLIER_CAPS = {'connections': 50, 'seconds': 60, 'input_seconds': 30, 'output_seconds': 20, 'turns': 6,
                'tools': 6, 'text_bytes': 8000, 'max_output_tokens': 256, 'total_usd': None, 'reserve_usd': 0.25}


class LimitsFile(unittest.TestCase):
    def override(self, changes):
        temp = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False)
        self.addCleanup(lambda: Path(temp.name).unlink())
        json.dump(changes, temp)
        temp.close()
        return temp.name

    def test_defaults_are_the_file_and_nothing_else(self):
        self.assertEqual(load_limits(override=''), DEFAULTS)
        self.assertEqual({k: LIMITS[k] for k in SESSION}, dict(SESSION))

    def test_an_override_changes_only_what_it_names(self):
        loaded = load_limits(self.override({'session': {'seconds': 90, 'usage_stop_usd': 0.2}}))
        self.assertEqual(loaded['session'], {**DEFAULTS['session'], 'seconds': 90, 'usage_stop_usd': 0.2})
        self.assertEqual(loaded['updates'], DEFAULTS['updates'])

    def test_a_typo_or_a_cap_that_is_not_a_positive_number_is_refused(self):
        for bad in ({'sesion': {}}, {'session': {'second': 90}}, {'session': {'seconds': 0}},
                    {'session': {'seconds': -5}}, {'session': {'tools': 2.5}}, {'session': {'seconds': '90'}},
                    {'session': {'seconds': True}}, {'updates': {'batches': None}}, {'session': []}, []):
            with self.subTest(bad=bad), self.assertRaisesRegex(RuntimeError, 'live_limits_invalid'):
                load_limits(self.override(bad))
        with self.assertRaisesRegex(RuntimeError, 'live_limits_invalid'):
            load_limits('/nonexistent/limits.json')

    def test_node_and_python_read_the_same_numbers(self):
        path = self.override({'session': {'seconds': 45, 'usage_stop_usd': 0.3}, 'updates': {'batches': 7}})
        script = "import('./live-limits.mjs').then(m=>console.log(JSON.stringify(m.loadLimits(process.argv[1]))))"
        node = subprocess.run(['node', '-e', script, path], cwd=ROOT, capture_output=True, text=True, timeout=20)
        self.assertEqual(node.returncode, 0, node.stderr)
        self.assertEqual(json.loads(node.stdout), load_limits(path))

    def test_the_defaults_let_a_session_outlast_a_game(self):
        # The acceptance test (test_live_playthrough.py) plays a whole game; this pins the floor it needs.
        s = DEFAULTS['session']
        self.assertGreaterEqual(s['tools'], 2 * 22)
        self.assertGreaterEqual(s['seconds'], 300)
        self.assertGreater(DEFAULTS['updates']['batches'], 7)


class EarlierLedger(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.directory = self.root / '.live'
        self.directory.mkdir()
        self.grant = {'schema': 2, 'authorization': 'first-playtest', 'connectionLimit': 50, 'projectVerified': True}
        self.attempts = [{'attempt': n, 'status': 'user_stop', 'tools': 3} for n in range(1, 6)]
        patcher = patch('live_budget.ROOT', self.root)
        patcher.start()
        self.addCleanup(patcher.stop)

    def write(self, limits):
        (self.directory / 'authorization.json').write_text(json.dumps(self.grant))
        (self.directory / 'ledger.json').write_text(json.dumps(
            {'authorization': self.grant['authorization'], 'limits': limits, 'attempts': self.attempts}))

    def test_a_grant_keeps_its_count_when_the_session_caps_change(self):
        self.write(EARLIER_CAPS)
        self.assertEqual(quota_status(self.directory)['remaining'], 45)
        ledger = Ledger()
        try:
            row = ledger.reserve()
            self.assertEqual(row['attempt'], 6)
            self.assertEqual(row['limits'], dict(SESSION), 'each attempt records the caps it ran under')
            self.assertEqual(ledger.available('tools'), SESSION['tools'])
            ledger.finish('closed')
        finally:
            ledger.close()
        self.assertEqual(quota_status(self.directory)['remaining'], 44)
        stored = json.loads((self.directory / 'ledger.json').read_text())
        self.assertEqual(stored['attempts'][:5], self.attempts, 'earlier attempts are not rewritten')
        self.assertEqual(stored['limits'], EARLIER_CAPS, 'the grant record is not rewritten')

    def test_a_count_that_is_not_the_grants_is_still_refused(self):
        for change in ({'connections': 51}, {'total_usd': 5}):
            with self.subTest(change=change):
                self.write({**EARLIER_CAPS, **change})
                with self.assertRaisesRegex(RuntimeError, 'mismatch'):
                    quota_status(self.directory)
                with self.assertRaisesRegex(RuntimeError, 'mismatch'):
                    Ledger()

    def test_the_cost_stop_follows_the_configured_amount(self):
        self.write(EARLIER_CAPS)
        with patch.dict(live_budget.LIMITS, {'usage_stop_usd': 0.02}):
            ledger = Ledger()
            try:
                ledger.reserve()
                ledger.usage({'prompt_token_count': 1000})           # $0.003
                with self.assertRaisesRegex(RuntimeError, 'live_usage_stop'):
                    ledger.usage({'prompt_token_count': 6000})       # $0.021 in all
            finally:
                ledger.close()


if __name__ == '__main__':
    unittest.main()
