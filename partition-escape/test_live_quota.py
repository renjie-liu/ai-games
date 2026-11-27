"""Connection accounting only. No player audio, game session or provider access."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from live_budget import Ledger, grant_limits, quota_status


class HumanPlaytestQuota(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        self.directory = root / '.live'
        self.directory.mkdir()
        self.grant = {'schema': 2, 'authorization': 'local-test', 'connectionLimit': 50,
                      'projectVerified': False}
        self.data = {'authorization': 'local-test', 'limits': grant_limits(self.grant), 'attempts': []}
        root_patch = patch('live_budget.ROOT', root)
        root_patch.start()
        self.addCleanup(root_patch.stop)

    def write(self):
        (self.directory / 'authorization.json').write_text(json.dumps(self.grant))
        (self.directory / 'ledger.json').write_text(json.dumps(self.data))

    def test_count_grant_alone_cannot_spend(self):
        self.write()
        self.assertEqual(quota_status(self.directory)['remaining'], 50)
        ledger = Ledger()
        try:
            with self.assertRaisesRegex(RuntimeError, 'project_unverified'):
                ledger.reserve()
        finally:
            ledger.close()
        self.assertEqual(quota_status(self.directory)['remaining'], 50)

    def test_fiftieth_attempt_persists_and_fifty_first_is_refused(self):
        self.grant['projectVerified'] = True
        self.data['attempts'] = [{'attempt': n} for n in range(1, 50)]
        self.write()
        self.assertEqual(quota_status(self.directory)['remaining'], 1)
        ledger = Ledger()
        try:
            self.assertEqual(ledger.reserve()['attempt'], 50)
            ledger.finish('closed')
        finally:
            ledger.close()
        self.assertEqual(quota_status(self.directory)['remaining'], 0)
        reopened = Ledger()
        try:
            with self.assertRaisesRegex(RuntimeError, 'exhausted'):
                reopened.reserve()
        finally:
            reopened.close()

    def test_mismatched_count_is_refused_by_status_and_worker(self):
        self.data['limits']['connections'] = 51
        self.write()
        with self.assertRaisesRegex(RuntimeError, 'mismatch'):
            quota_status(self.directory)
        with self.assertRaisesRegex(RuntimeError, 'mismatch'):
            Ledger()
