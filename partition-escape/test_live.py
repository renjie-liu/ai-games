import json,math,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from live_budget import Ledger,LIMITS
from live_worker import slim,TOOLS,SYSTEM
class LiveTests(unittest.TestCase):
    def setUp(self):self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
    def ledger(self):
        l=Ledger(self.temp.name,fixture=True);self.addCleanup(l.close);return l
    def test_two_connections_persist_no_refund(self):
        for i in range(2):
            l=self.ledger();self.assertEqual(l.reserve()['attempt'],i+1);l.finish('failed');l.close()
        with self.assertRaisesRegex(RuntimeError,'exhausted'):self.ledger().reserve()
    def test_lock(self):
        l=self.ledger();l.reserve()
        with self.assertRaisesRegex(RuntimeError,'already_running'):Ledger(self.temp.name,fixture=True)
    def test_deleted_ledger_not_reset(self):
        l=self.ledger();l.reserve();l.path.unlink();l.close()
        with self.assertRaisesRegex(RuntimeError,'missing_no_reset'):Ledger(self.temp.name,fixture=True)
    def test_fixed_path(self):
        with self.assertRaisesRegex(RuntimeError,'alternate_ledger'):Ledger(self.temp.name)
    def test_all_usage_limits_before_mutation(self):
        l=self.ledger();l.reserve()
        for k in ('input_seconds','output_seconds','text_bytes','turns','tools'):
            l.debit(k,LIMITS[k]);before=l.path.read_bytes()
            with self.assertRaises(RuntimeError):l.debit(k,1)
            self.assertEqual(l.path.read_bytes(),before)
    def test_nonfinite_or_negative_denied(self):
        l=self.ledger();l.reserve()
        for x in [float('nan'),float('inf'),-1]:
            with self.assertRaisesRegex(RuntimeError,'invalid_usage'):l.debit('input_seconds',x)
    def test_corrupt_config_not_reset(self):
        l=self.ledger();l.reserve();l.data['limits']={'connections':100};l.save();l.close()
        with self.assertRaisesRegex(RuntimeError,'mismatch'):Ledger(self.temp.name,fixture=True)
    def test_conservative_usage_stop_retains_observed_usage(self):
        l=self.ledger();l.reserve();u={'prompt_token_count':1000,'response_token_count':100}
        l.usage(u);self.assertAlmostEqual(l.row['estimated_usd'],.0042)
        with self.assertRaisesRegex(RuntimeError,'usage_stop'):l.usage({'prompt_token_count':50000})
        self.assertEqual(len(l.row['usage']),2)
    def test_slim_excludes_other_tokens_events(self):
        v={'role':'east','local':{'own':True},'other_private':'SENTINEL','tokens':'SENTINEL','events':[{'text':'SENTINEL'}],'scene':[{'id':'hatch','name':'传物槽','secret':'SENTINEL'}]}
        self.assertNotIn('SENTINEL',json.dumps(slim(v)))
    def test_public_index_ignores_private_fields(self):
        from live_trace import page
        data={'events':[{'source':'gemini-live','kind':'tool_result','at_ms':2,'call_alias':'a'*24,'private':'SENTINEL','receipt':{'command':'查看本侧物件','outcome':'recorded','code':'ok','roomEventIds':[2],'private':'SENTINEL'},'harness_chunk':'chunk'}],'audit':{'status':'done','key':'SENTINEL'}}
        html=page(data,'room','east');self.assertNotIn('SENTINEL',html);self.assertIn('未提供',html);self.assertIn('#2',html)
    def test_live_config_supported_offline(self):
        from google.genai import types
        c=types.LiveConnectConfig(response_modalities=['AUDIO'],tools=TOOLS,system_instruction=SYSTEM,max_output_tokens=256,realtime_input_config={'automatic_activity_detection':{'disabled':True}})
        self.assertEqual(c.max_output_tokens,256)

class MigrationAuthorizationTest(unittest.TestCase):
    def test_new_game_copy_never_mints_real_live_credit(self):
        with tempfile.TemporaryDirectory() as tmp,patch('live_budget.ROOT',Path(tmp)):
            with self.assertRaisesRegex(RuntimeError,'live_authorization_required'):Ledger()
            self.assertFalse((Path(tmp)/'.live').exists())

if __name__=='__main__':unittest.main()
