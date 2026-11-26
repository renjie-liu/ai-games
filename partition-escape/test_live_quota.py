"""Connection accounting only. No player audio, game session or provider access."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import live_budget
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


class SeveralSessionsShareOneLedger(unittest.TestCase):
    """A hosted server runs more than one voice session at a time (live-limits.json,
    server.concurrent_sessions). Each session is its own worker process with its own Ledger on the
    one file, so no write may lose another session's row, and the counts are checked on the file
    as it is at that moment, not as it was when the session opened."""

    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.directory = self.root / '.live'
        self.directory.mkdir()
        self.grant = {'schema': 2, 'authorization': 'shared-test', 'connectionLimit': 5, 'projectVerified': True}
        (self.directory / 'authorization.json').write_text(json.dumps(self.grant))
        (self.directory / 'ledger.json').write_text(json.dumps(
            {'authorization': 'shared-test', 'limits': grant_limits(self.grant), 'attempts': []}))
        for p in (patch('live_budget.ROOT', self.root), patch.dict(live_budget.SERVER, {'concurrent_sessions': 2})):
            p.start()
            self.addCleanup(p.stop)
        self.open = []
        self.addCleanup(lambda: [ledger.close() for ledger in self.open])

    def ledger(self, **options):
        self.open.append(Ledger(**options))
        return self.open[-1]

    def rows(self):
        return json.loads((self.directory / 'ledger.json').read_text())['attempts']

    def test_two_sessions_run_side_by_side_and_neither_loses_what_the_other_wrote(self):
        first, second = self.ledger(), self.ledger()
        self.assertEqual((first.reserve()['attempt'], second.reserve()['attempt']), (1, 2))
        first.debit('turns', 1)
        second.debit('tools', 2)
        first.debit('turns', 1)
        second.usage({'prompt_token_count': 1000})
        first.finish('user_stop')
        by_attempt = {row['attempt']: row for row in self.rows()}
        self.assertEqual((by_attempt[1]['turns'], by_attempt[1]['tools'], by_attempt[1]['status']), (2, 0, 'user_stop'))
        self.assertEqual((by_attempt[2]['turns'], by_attempt[2]['tools'], by_attempt[2]['status']), (0, 2, 'reserved'))
        self.assertEqual(by_attempt[2]['usage'], [{'prompt_token_count': 1000}])
        self.assertEqual(quota_status(self.directory)['remaining'], 3)

    def test_one_more_session_than_the_server_allows_is_refused_until_a_place_is_free(self):
        first, second = self.ledger(), self.ledger()
        with self.assertRaisesRegex(RuntimeError, 'live_session_already_running'):
            Ledger()
        first.close()
        self.ledger().reserve()
        self.assertEqual(len(self.rows()), 1)

    def test_by_default_one_session_runs_at_a_time(self):
        with patch.dict(live_budget.SERVER, {'concurrent_sessions': 1}):
            self.ledger()
            with self.assertRaisesRegex(RuntimeError, 'live_session_already_running'):
                Ledger()

    def test_a_session_that_dies_gives_its_place_back(self):
        holder = ('import sys,time;from pathlib import Path;import live_budget;'
                  'live_budget.ROOT=Path(sys.argv[1]);live_budget.SERVER["concurrent_sessions"]=1;'
                  'ledger=live_budget.Ledger();ledger.reserve();print("held",flush=True);time.sleep(60)')
        with patch.dict(live_budget.SERVER, {'concurrent_sessions': 1}):
            child = subprocess.Popen([sys.executable, '-c', holder, str(self.root)], cwd=Path(__file__).parent,
                                     stdout=subprocess.PIPE, text=True)
            try:
                self.assertEqual(child.stdout.readline().strip(), 'held')
                with self.assertRaisesRegex(RuntimeError, 'live_session_already_running'):
                    Ledger()
            finally:
                child.kill()
                child.wait(10)
                child.stdout.close()
            self.assertEqual(self.ledger().reserve()['attempt'], 2, 'the dead session keeps its attempt; its place is free')

    def test_the_last_connection_of_the_grant_goes_to_one_session_only(self):
        self.grant['connectionLimit'] = 1
        (self.directory / 'authorization.json').write_text(json.dumps(self.grant))
        (self.directory / 'ledger.json').write_text(json.dumps(
            {'authorization': 'shared-test', 'limits': grant_limits(self.grant), 'attempts': []}))
        first, second = self.ledger(), self.ledger()   # both opened while one connection was left
        first.reserve()
        with self.assertRaisesRegex(RuntimeError, 'live_authorization_exhausted'):
            second.reserve()
        self.assertEqual(len(self.rows()), 1)

    def test_an_invitation_has_its_own_count_kept_in_the_same_ledger(self):
        friends = {'name': '朋友', 'connections': 1}
        first = self.ledger(invite=friends)
        self.assertEqual(first.reserve()['invite'], '朋友')
        first.finish('user_stop')
        first.close()
        again = self.ledger(invite=friends)
        with self.assertRaisesRegex(RuntimeError, 'live_invite_exhausted'):
            again.reserve()
        self.assertEqual(len(self.rows()), 1, 'a refused connection is not counted against the grant')
        self.ledger(invite={'name': '同事', 'connections': 3}).reserve()
        status = quota_status(self.directory)
        self.assertEqual(status['invites'], {'朋友': 1, '同事': 1})
        self.assertEqual(status['remaining'], 3)
        # A session started without an invitation, as on this machine, is counted against the grant alone.
        again.close()
        self.assertNotIn('invite', self.ledger().reserve())

    def test_the_worker_is_told_its_invitation_by_the_server_that_started_it(self):
        self.assertIsNone(live_budget.invite_from_env({}))
        self.assertEqual(live_budget.invite_from_env({'PARTITION_INVITE_NAME': '朋友', 'PARTITION_INVITE_CONNECTIONS': '20'}),
                         {'name': '朋友', 'connections': 20})
        for bad in ({'PARTITION_INVITE_NAME': '朋友'}, {'PARTITION_INVITE_NAME': '朋友', 'PARTITION_INVITE_CONNECTIONS': 'many'}):
            with self.assertRaisesRegex(RuntimeError, 'live_invite_invalid'):
                live_budget.invite_from_env(bad)

    def test_an_invitation_is_a_name_and_a_whole_number_of_connections(self):
        for bad in ({'name': '', 'connections': 1}, {'name': '朋友', 'connections': 0}, {'name': '朋友', 'connections': 1.5},
                    {'name': '朋友'}, {'connections': 2}, '朋友'):
            with self.assertRaisesRegex(RuntimeError, 'live_invite_invalid', msg=str(bad)):
                Ledger(invite=bad)
