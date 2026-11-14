import unittest
from seat_worker import public_trace, script_command, NoInternalPayloadProvider
from harness.providers import Completion

class PublicTraceTest(unittest.TestCase):
    def test_raw_internal_payload_is_not_retained_but_billing_is(self):
        class P:
            name='local-test';capabilities=None
            def complete(self,messages,max_tokens):
                return Completion('{"actions":[]}',12,1,7,0,{'thinking':'PRIVATE'},thinking_tokens=3)
        c=NoInternalPayloadProvider(P()).complete([],10)
        self.assertNotIn('PRIVATE',str(c.raw));self.assertEqual(c.output_tokens,7)
        self.assertEqual(c.thinking_tokens,3);self.assertEqual(c.text,'{"actions":[]}')
    def test_allowlist_drops_private_content_and_internal_thinking(self):
        secret='SENTINEL-PRIVATE-OBSERVATION'
        raw={'header':{'run_id':'real-run','secret':secret},'steps':[{
            'observation':{'observation_id':'o1','state_text':secret,'memory_text':secret},
            'chunk':{'chunk_id':'c1','actions':[{'type':'type','text':secret}]},
            'calls':[{'request_id':'r1','response':secret,'thoughts':secret,'cost_usd':0}],
            'results':[{'status':'executed','chunk_id':'c1','reason':secret}],
            'commentary':secret,'frames':{'x':secret}}], 'events':[secret],'memory':secret}
        import json
        safe=public_trace(raw,'script-stub')
        self.assertNotIn(secret,json.dumps(safe))
        self.assertEqual(safe['steps'][0]['calls'][0]['request_id'],'r1')
        self.assertEqual(safe['steps'][0]['results'][0]['status'],'executed')
    def test_policy_pauses_and_cannot_read_world(self):
        self.assertIsNone(script_command({'paused':True,'complete':False}))
        self.assertIsNone(script_command({'paused':False,'complete':True}))
    def test_west_script_recovers_after_partner_releases_too_early(self):
        v={'paused':False,'complete':False,'role':'west','pending':None,'scene':[],'notes':[],'shared':[],'messages':[],
           'signals':{'hold-brake':10,'release-brake':15},
           'local':{'power':False,'doorOpen':False,'keyHere':True,'unlocked':True}}
        self.assertEqual(script_command(v),{'type':'action','id':'power-on'})

    def test_script_waits_after_deferred_proposal_until_partner_contributes(self):
        v={'paused':False,'complete':False,'role':'east','pending':None,'scene':[],'notes':[],'shared':[],'messages':[],
           'signals':{},'local':{'keyHere':True,'braceSeen':False},
           'events':[{'id':10,'seat':'west','type':'decision','proposal':'send-key','proposer':'east','resolution':'decline'}]}
        first=script_command(v)
        self.assertEqual(first['type'],'say')
        v['messages']=[{'seat':'east','text':first['text'],'source':'script'}]
        self.assertIsNone(script_command(v))
        v['events'].append({'id':11,'seat':'west','type':'inspect'})
        self.assertIsNone(script_command(v))
        v['events'].append({'id':12,'seat':'west','type':'action'})
        self.assertEqual(script_command(v),{'type':'action','id':'send-key'})
    def test_script_reports_brake_and_fan_without_prescribing_partner_next_action(self):
        v={'paused':False,'complete':False,'role':'east','pending':None,'scene':[],'notes':[],'shared':[],'messages':[],
           'signals':{},'local':{'keyHere':False,'gateOpen':True,'holdingBrake':True,'fanSpinning':True,'braced':False,'braceSeen':True}}
        v['notes']=[{'id':'brace-found'}];v['shared']=[{'id':'brace-found'}]
        self.assertEqual(script_command(v),{'type':'say','text':'我已拉住手闸。闸门保持开启，风扇还在转。'})

    def key_view(self):
        return {'paused':False,'complete':False,'role':'east','pending':None,'scene':[],
                'notes':[],'shared':[],'messages':[],'signals':{},'events':[],
                'local':{'keyHere':True,'braceSeen':False}}

    def test_first_key_handoff_waits_for_peer_exploration_but_self_explores(self):
        v=self.key_view()
        v['scene']=[{'id':'shelf','inspected':False}]
        self.assertEqual(script_command(v),{'type':'inspect','id':'shelf'})
        v['scene'][0]['inspected']=True
        v['events']=[{'id':1,'seat':'east','type':'inspect'}]
        for _ in range(5): self.assertIsNone(script_command(v))
        v['events'].append({'id':2,'seat':'west','type':'inspect'})
        self.assertEqual(script_command(v),{'type':'action','id':'send-key'})

    def test_unknown_negative_question_and_conditional_messages_never_restart_handoff(self):
        for deferred in (False,True):
            for text in ('香蕉会唱歌吗','先别递钥匙','不要重新提议','钥匙递过来吧？','如果我准备好了再递钥匙',
                         '能不能把钥匙递过来','再提一次但是先别递','还没准备好'):
                with self.subTest(deferred=deferred,text=text):
                    v=self.key_view()
                    # Without previous readiness, neutral prose cannot grant it.
                    v['events']=[]
                    if deferred:
                        v['events'].append({'id':2,'seat':'west','type':'decision','proposal':'send-key','proposer':'east','resolution':'decline'})
                    v['events'].append({'id':3,'seat':'west','type':'message','text':text,'source':'human'})
                    v['messages']=[{'seat':'west','source':'human','text':text}]
                    for _ in range(4):
                        command=script_command(v)
                        self.assertTrue(command is None or command['type']=='say',command)
                        if command: v['messages'].append({'seat':'east','source':'script','text':command['text']})

    def test_explicit_handoff_request_has_consistent_reply_then_proposes_not_executes(self):
        for deferred in (False,True):
            for text in ('准备好了','我准备好了','好，钥匙递过来吧','好，把钥匙递过来吧'):
                with self.subTest(deferred=deferred,text=text):
                    v=self.key_view()
                    if deferred:
                        v['events']=[{'id':1,'seat':'west','type':'decision','proposal':'send-key','proposer':'east','resolution':'decline'}]
                    v['events'].append({'id':2,'seat':'west','type':'message','text':text,'source':'human'})
                    v['messages']=[{'seat':'west','source':'human','text':text}]
                    reply=script_command(v)
                    self.assertIn('收到提议请求',reply['text']);self.assertIn('仍需',reply['text'])
                    self.assertNotIn('不能理解',reply['text'])
                    v['messages'].append({'seat':'east','source':'script','text':reply['text']})
                    self.assertEqual(script_command(v),{'type':'action','id':'send-key'})

    def test_neutral_conversation_preserves_existing_first_contact_and_retry_readiness(self):
        for deferred in (False,True):
            for text in ('你那边有什么？','还有别的线索吗？','你还没发现线索吗？',
                         '香蕉会唱歌吗','如果我准备好了再递钥匙','准备好了？'):
                with self.subTest(deferred=deferred,text=text):
                    v=self.key_view()
                    if deferred:
                        v['events']=[{'id':1,'seat':'west','type':'decision','proposal':'send-key','proposer':'east','resolution':'decline'},
                                     {'id':2,'seat':'west','type':'message','text':'准备好了','source':'human'}]
                    else:
                        v['events']=[{'id':2,'seat':'west','type':'inspect'}]
                    v['events'].append({'id':3,'seat':'west','type':'message','text':text,'source':'human'})
                    v['messages']=[{'seat':'west','source':'human','text':text}]
                    reply=script_command(v)
                    self.assertEqual(reply['type'],'say')
                    self.assertNotIn('收到提议请求',reply['text'])
                    self.assertNotIn('会弹出确认',reply['text'])
                    v['messages'].append({'seat':'east','source':'script','text':reply['text']})
                    self.assertEqual(script_command(v),{'type':'action','id':'send-key'})

    def test_first_contact_fallback_does_not_promise_confirmation_or_assume_previous_proposal(self):
        for text in ('香蕉会唱歌吗','如果我准备好了再递钥匙','准备好了？','好，把钥匙递过来吧？','先等等'):
            with self.subTest(text=text):
                v=self.key_view()
                v['events']=[{'id':1,'seat':'west','type':'message','text':text,'source':'human'}]
                v['messages']=[{'seat':'west','source':'human','text':text}]
                reply=script_command(v)
                for claim in ('会弹出确认','收到提议请求','重提','再提一次'):
                    self.assertNotIn(claim,reply['text'])
                v['messages'].append({'seat':'east','source':'script','text':reply['text']})
                self.assertIsNone(script_command(v))

    def test_latest_human_message_can_defer_a_previous_ready_request(self):
        v=self.key_view()
        v['events']=[{'id':1,'seat':'west','type':'message','text':'再提一次','source':'human'},
                     {'id':2,'seat':'west','type':'message','text':'先等等','source':'human'}]
        self.assertIsNone(script_command(v))
        v['events'].append({'id':3,'seat':'west','type':'message','text':'你那边有什么？','source':'human'})
        self.assertIsNone(script_command(v))
        v['events'].append({'id':4,'seat':'west','type':'inspect'})
        v['events'].append({'id':5,'seat':'west','type':'message','text':'我在等你准备好。','source':'script'})
        self.assertEqual(script_command(v),{'type':'action','id':'send-key'})

    def test_after_handoff_reports_own_gate_not_partner_solution(self):
        v=self.key_view()
        v['local'].update(keyHere=False,gateOpen=False,holdingBrake=False,braced=False)
        self.assertEqual(script_command(v),{'type':'say','text':'我这边的闸门还关着，风扇没有转。我会等你。'})

if __name__=='__main__': unittest.main()
