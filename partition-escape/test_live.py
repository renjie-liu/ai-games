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
        l=self.ledger();l.reserve();l.data['limits']={'connections':100};l.write();l.close()   # the file itself is changed, as by hand
        with self.assertRaisesRegex(RuntimeError,'mismatch'):Ledger(self.temp.name,fixture=True)
    def test_conservative_usage_stop_retains_observed_usage(self):
        l=self.ledger();l.reserve();u={'prompt_token_count':1000,'response_token_count':100}
        l.usage(u);self.assertAlmostEqual(l.row['estimated_usd'],.0042)
        with self.assertRaisesRegex(RuntimeError,'usage_stop'):l.usage({'prompt_token_count':math.ceil(LIMITS['usage_stop_usd']/3e-6)})
        self.assertEqual(len(l.row['usage']),2)
    def test_slim_excludes_other_tokens_events(self):
        v={'role':'east','local':{'own':True},'other_private':'SENTINEL','tokens':'SENTINEL','events':[{'text':'SENTINEL'}],'scene':[{'id':'hatch','name':'传物槽','secret':'SENTINEL'}]}
        self.assertNotIn('SENTINEL',json.dumps(slim(v)))
    def test_within_a_session_each_fact_clue_and_message_is_sent_once(self):
        from live_worker import Session
        s=Session.__new__(Session)
        note=lambda i:{'id':i,'object':'gate','source':'东席','text':'说明'+i}
        view={'role':'east','local':{'gateOpen':False},'pending':None,'paused':False,'complete':False,'signals':{},
              'notes':[note('gate-rule'),note('brake-rule')],'shared':[{'id':'interlock','seat':'west','text':'线索'}],
              'messages':[{'seat':'west','text':'你好','source':'human','at':10}],
              'scene':[{'id':'brake','name':'手闸','actions':[{'id':'hold-brake','label':'拉住手闸','shared':False}],'secret':'SENTINEL'}],'tokens':'SENTINEL'}
        first=s.fresh(view)
        self.assertEqual([n['id'] for n in first['notes']],['gate-rule','brake-rule']);self.assertEqual(len(first['shared']),1);self.assertEqual(len(first['messages']),1)
        self.assertNotIn('SENTINEL',json.dumps(first))
        # Nothing new: the state and what can be done now are all there is to say.
        again=s.fresh(view)
        self.assertEqual(set(again),{'role','local','pending','paused','complete','signals','scene'})
        self.assertEqual(again['scene'][0]['actions'][0]['id'],'hold-brake')
        # The room changes: only what is new comes with it.
        later={**view,'local':{'gateOpen':True},'notes':view['notes']+[note('brace-found')],
               'messages':view['messages']+[{'seat':'west','text':'动力接通了','source':'human','at':20}]}
        third=s.fresh(later)
        self.assertEqual([n['id'] for n in third['notes']],['brace-found']);self.assertEqual([m['text'] for m in third['messages']],['动力接通了'])
        self.assertNotIn('shared',third);self.assertEqual(third['local'],{'gateOpen':True})
        # A new session starts from nothing told.
        self.assertEqual(len(Session.__new__(Session).fresh(later)['notes']),3)
    def test_a_fact_in_a_view_that_was_never_sent_is_told_again(self):
        from live_worker import Session
        s=Session.__new__(Session)
        note=lambda i:{'id':i,'text':'说明'+i}
        view={'role':'east','notes':[note('gate-rule')],'shared':[],'messages':[{'seat':'west','text':'你好','at':10}],'scene':[]}
        s.fresh(view)
        later={**view,'notes':view['notes']+[note('brace-found')],'messages':view['messages']+[{'seat':'west','text':'动力接通了','at':20}]}
        dropped=s.fresh(later);self.assertEqual([n['id'] for n in dropped['notes']],['brace-found'])
        s.untell()   # the response had to be cut down to its receipt: the view did not go out
        again=s.fresh(later)
        self.assertEqual([n['id'] for n in again['notes']],['brace-found']);self.assertEqual([m['text'] for m in again['messages']],['动力接通了'])
        self.assertNotIn('notes',s.fresh(later))
    def test_public_index_ignores_private_fields(self):
        from live_trace import page
        data={'events':[{'source':'gemini-live','kind':'tool_result','at_ms':2,'call_alias':'a'*24,'private':'SENTINEL','receipt':{'command':'查看本侧物件','outcome':'recorded','code':'ok','roomEventIds':[2],'private':'SENTINEL'},'harness_chunk':'chunk'}],'audit':{'status':'done','key':'SENTINEL'}}
        html=page(data,'room','east');self.assertNotIn('SENTINEL',html);self.assertIn('未提供',html);self.assertIn('#2',html)
    def test_live_config_supported_offline(self):
        from google.genai import types
        c=types.LiveConnectConfig(response_modalities=['AUDIO'],tools=TOOLS,system_instruction=SYSTEM,max_output_tokens=256,realtime_input_config={'automatic_activity_detection':{'disabled':True}})
        self.assertEqual(c.max_output_tokens,256)
    def test_player_update_pipe_contains_only_delivery_references(self):
        from live_worker import Session
        from types import SimpleNamespace
        import time
        session=Session.__new__(Session)
        session.fixture=True;session.epoch=2;session.started=time.monotonic();session.public=[]
        session.root=Path(self.temp.name);session.seat='east'
        session.api=SimpleNamespace(url='http://127.0.0.1/fixture')
        session.ledger=SimpleNamespace(row={})
        with patch('live_worker.emit') as emit,patch('live_worker.write_public_index'):
            session.record('context_update',stage='worker',status='fixture_sent',reason='provider_returned',sequences=[1],room_event_ids=[3],private='PRIVATE_SENTINEL',ticket='PRIVATE_SENTINEL')
            row=emit.call_args.args[0]
            self.assertEqual(set(row),{'type','stage','status','reason','sequences','room_event_ids'})
            self.assertNotIn('PRIVATE_SENTINEL',json.dumps(row))
            emit.reset_mock();session.record('usage_received')
            emit.assert_not_called()

class MigrationAuthorizationTest(unittest.TestCase):
    def test_new_game_copy_never_mints_real_live_credit(self):
        with tempfile.TemporaryDirectory() as tmp,patch('live_budget.ROOT',Path(tmp)):
            with self.assertRaisesRegex(RuntimeError,'live_authorization_required'):Ledger()
            self.assertFalse((Path(tmp)/'.live').exists())

if __name__=='__main__':unittest.main()
