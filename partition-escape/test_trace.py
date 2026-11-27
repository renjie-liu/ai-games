import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from public_trace import public_trace, public_studio, summary_options
from seat_worker import SeatAdapter, SeatActor
from harness.log.events import EventLog

class TraceTests(unittest.TestCase):
    def data(self,commentary=None):
        v={'signals':{'hold-brake':12,'power-on':10,'power-off':14},'pending':None}
        return {'header':{'run_id':'fixture'},'events':[{'type':'progress','channel':'partition_command','chunk_id':'c1',
          'receipt':{'requestId':'req1','command':'取出并安装木撑','outcome':'applied','seat':'east','code':'ok',
            'roomEventIds':[15],'changes':{'gateOpen':True,'inventory':'PRIVATE'},'debug':'PRIVATE'}}],
          'steps':[{'observation':{'observation_id':'o1','seq':1,'ts':1,'trigger':'chunk_done','state_text':json.dumps(v)},
            'chunk':{'chunk_id':'c1','seq':3,'ts':3,'commentary':commentary,
                     'actions':[{'type':'type','text':json.dumps({'type':'action','id':'brace'})}]},
            'calls':[{'request_id':'model-call1','seq':2,'ts':2,'role':'actor','response':'PRIVATE','prompt':'PRIVATE','thoughts':'PRIVATE'}],
            'results':[{'chunk_id':'c1','index':0,'status':'executed','seq':5,'ts':5}]}]}
    def test_legacy_script_template_is_not_misrepresented_as_branch_reason(self):
        d=self.data();v=json.loads(d['steps'][0]['observation']['state_text'])
        d['steps'][0]['chunk']['commentary']=summary_options(v,{'type':'action','id':'brace'})[0]
        s=public_trace(d,'脚本 stub')['steps'][0]
        self.assertEqual(s['public_reason']['status'],'unverified')
        self.assertFalse(s['public_reason']['trigger_rule_recorded'])
        self.assertEqual(s['public_receipt']['roomEventIds'],[15]);self.assertEqual(s['public_receipt']['requestId'],'req1')
        self.assertEqual(s['calls'][0]['request_id'],'model-call1');self.assertNotIn('PRIVATE',json.dumps(s))
    def test_model_summary_exact_safe_choice_or_explicit_omission(self):
        d=self.data();v=json.loads(d['steps'][0]['observation']['state_text']);good=summary_options(v,{'type':'action','id':'brace'})[0]
        for text,status in [(good,'provided'),(None,'not_provided'),(good+' PRIVATE','omitted'),('PRIVATE','omitted')]:
            d['steps'][0]['chunk']['commentary']=text;s=public_trace(d,'真实模型 · public-safe')['steps'][0]
            self.assertEqual(s['public_reason']['status'],status);self.assertNotIn('PRIVATE',json.dumps(s))
        d['steps'][0]['observation']['state_text']='{}';d['steps'][0]['chunk']['commentary']=good
        self.assertEqual(public_trace(d,'真实模型 · public-safe')['steps'][0]['public_reason']['status'],'omitted')
    def test_menu_sent_to_actor(self):
        d=self.data();context=SimpleNamespace(observation=SimpleNamespace(state_text=d['steps'][0]['observation']['state_text']))
        messages=SeatActor().request(context,None);v=json.loads(messages[1].text)
        self.assertTrue(v['_public_summary_choices']);self.assertIn('leave it empty',messages[0].text)
    def test_missing_receipt_never_invents_effect(self):
        d=self.data();d['events']=[];d['steps'][0]['results']=[{'status':'aborted','reason':'frame_diverged'}]
        s=public_trace(d,'离线 fixture · 非真实模型')['steps'][0]
        self.assertIsNone(s['public_receipt']);self.assertIn('无机关回执',s['visual_outcome']['summary']);self.assertEqual(s['results'][0]['reason'],'frame_diverged')
        self.assertEqual(s['public_execution']['state'],'aborted');self.assertIn('frame_diverged',s['public_execution']['detail'])
        self.assertNotIn('可能',s['public_execution']['detail'])
    def test_delivered_input_does_not_mean_applied_game_action(self):
        for outcome in ('proposed','applied','recorded','waiting','rejected'):
            d=self.data();d['events'][0]['receipt']['outcome']=outcome
            s=public_trace(d,'脚本 stub')['steps'][0]
            self.assertEqual(s['results'][0]['status'],'executed')
            self.assertEqual(s['public_execution']['state'],outcome)
            self.assertEqual(s['public_execution']['label']=='机关已执行',outcome=='applied')
    def test_retryable_conflict_records_wait_but_real_rejection_raises(self):
        class API:
            response={}
            def request(self,*args):return self.response
        api=API();adapter=SeatAdapter(api)
        with tempfile.TemporaryDirectory() as t:
            adapter.log=EventLog(Path(t)/'events.jsonl');adapter.log.append({'type':'run_header'});adapter.log.append({'type':'action_chunk','chunk_id':'c1'})
            for code in ('proposal_pending','stale_proposal','paused'):
                api.response={'ok':False,'retryable':True,'code':code,'view':{'pending':None},'receipt':{'outcome':'waiting'}}
                adapter.type_text('{"type":"action","id":"send-key"}');self.assertFalse(adapter.last_result['ok'])
                self.assertEqual(adapter.log.last(lambda e:e['type']=='progress')['chunk_id'],'c1')
            for code in ('permission_denied','rule_rejected','unknown'):
                api.response={'ok':False,'retryable':True,'code':code,'message':'actual rejection'}
                with self.assertRaisesRegex(ValueError,'actual rejection'):adapter.type_text('{"type":"action","id":"brace"}')
    def test_no_unsafe_output_in_html(self):
        d=self.data('SENTINEL_TOKEN_PRIVATE');s=d['steps'][0];s['observation']['state_text']=json.dumps({'private':'SENTINEL_TOKEN_PRIVATE'})
        s['chunk']['actions'][0]['text']=json.dumps({'type':'say','text':'SENTINEL_TOKEN_PRIVATE'})
        d['events'][0]['receipt']['command']='SENTINEL_TOKEN_PRIVATE';d['events'][0]['receipt']['requestId']='SENTINEL_TOKEN_PRIVATE / token'
        html=public_studio(d,'离线 fixture · 非真实模型')
        self.assertNotIn('SENTINEL_TOKEN_PRIVATE',html);self.assertIn('fixture',html);self.assertNotIn('"inventory"',html)

if __name__=='__main__':unittest.main()
