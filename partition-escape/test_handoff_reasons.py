"""Four handoff/physics reason branches: public evidence and explicit offline fixtures."""
import copy,json,os,unittest
from unittest.mock import patch
from types import SimpleNamespace
from script_policy import provider_decision,POLICY_VERSION
from seat_worker import ScriptProvider
from decision_reasons import project_reason,public_support,HANDOFF_REASONS
from public_trace import public_trace,public_studio
from test_reasons import trace

def base(seat='west'):
    local={'power':False,'keyHere':False,'unlocked':False,'doorOpen':False} if seat=='west' else {
        'gateOpen':False,'fanSpinning':False,'holdingBrake':False,'braced':False,'braceSeen':False,'keyHere':True}
    return {'rev':5,'paused':False,'complete':False,'role':seat,'local':local,'pending':None,
            'scene':[],'notes':[],'shared':[],'messages':[],'events':[],'signals':{}}

def pending(v,action,from_seat):
    v['pending']={'id':'p1','action':action,'from':from_seat}
    label={'send-key':'递出钥匙','power-off':'切断动力','open-door':'推开西门'}[action]
    v['events'].append({'id':v['rev'],'seat':from_seat,'type':'request','text':'提议'+label+'，等待对面准备好。'})
    return v

def examples():
    power=base()
    accept=pending(base(),'send-key','east')
    offer=base('east');offer['shared']=[{'id':'key-found','seat':'east','text':'PRIVATE_HANDOFF_SENTINEL'}]
    offer['events']=[{'id':2,'seat':'west','type':'inspect','text':'PRIVATE_HANDOFF_SENTINEL'}]
    decline=base('east');decline['local'].update(keyHere=False,fanSpinning=True,gateOpen=True)
    decline['signals']={'power-on':1};pending(decline,'power-off','west')
    return dict(power_closed_unheld=power,accept_key_missing=accept,offer_key_ready=offer,decline_local_safety=decline)

def reason(v):
    d=provider_decision(v)
    return project_reason(d.record(),v,d.command,'脚本 stub',[])

class HandoffReasonTests(unittest.TestCase):
    def test_actual_provider_branch_command_and_public_cause_match(self):
        for branch,v in examples().items():
            with self.subTest(branch=branch),patch.dict(os.environ,{'PARTITION_STEP_DELAY':'0'}):
                v['local']['private']='PRIVATE_HANDOFF_SENTINEL'
                reply=json.loads(ScriptProvider(None).complete([SimpleNamespace(text=json.dumps(v))],100).text)
                d=provider_decision(v)
                self.assertEqual(d.reason_id,branch)
                self.assertEqual(json.loads(reply['commentary'])['reason_id'],branch)
                self.assertEqual(json.loads(reply['actions'][0]['text']),d.command)
                r=reason(v);self.assertEqual(r['status'],'provided');self.assertEqual(r['reason_id'],branch)
                self.assertTrue(r['evidence'])
                html=public_studio(trace(v,reply['commentary']),'脚本 stub')
                self.assertNotIn('PRIVATE_HANDOFF_SENTINEL',html)
                self.assertNotIn('holdingBrake',html);self.assertNotIn('keyHere',html)
                self.assertIn(branch,html)

    def test_wrong_branch_command_version_or_missing_record_never_invents_cause(self):
        for branch,v in examples().items():
            d=provider_decision(v)
            for change in [{'reason_id':next(b for b in HANDOFF_REASONS if b!=branch)},
                           {'policy_version':'tampered'}]:
                record=json.loads(d.record());record.update(change)
                r=project_reason(json.dumps(record),v,d.command,'脚本 stub',[])
                self.assertEqual(r['status'],'unverified');self.assertIsNone(r['reason_id'])
            self.assertEqual(project_reason(d.record(),v,{'type':'say','text':'tampered'},'脚本 stub',[])['status'],'unverified')
            self.assertEqual(project_reason('',v,d.command,'脚本 stub',[])['status'],'not_provided')
            self.assertEqual(project_reason(d.record(),v,d.command,'离线 fixture · 非真实模型',[])['status'],'omitted')

    def test_missing_or_malformed_public_snapshot_is_not_initial_state(self):
        for branch,original in examples().items():
            for bad in [None,{'power-on':True},{'power-on':99},{'PRIVATE_HANDOFF_SENTINEL':1}]:
                v=copy.deepcopy(original);v['signals']=bad
                d=provider_decision(original)
                # Some malformed signals also prevent policy replay; neither path may publish.
                r=project_reason(d.record(),v,d.command,'脚本 stub',[])
                self.assertIn(r['status'],('omitted','unverified'));self.assertIsNone(r['reason_id'])
            v=copy.deepcopy(original);v.pop('rev')
            self.assertEqual(reason(v)['status'],'omitted')

    def test_public_support_never_reads_private_local_or_notes(self):
        for branch,v in examples().items():
            a=public_support(v,branch)
            v['local']={'PRIVATE_HANDOFF_SENTINEL':'PRIVATE_HANDOFF_SENTINEL'}
            v['notes']=[{'text':'PRIVATE_HANDOFF_SENTINEL'}]
            self.assertEqual(public_support(v,branch),a)
            self.assertNotIn('PRIVATE_HANDOFF_SENTINEL',json.dumps(a))

    def test_power_initial_and_recovery_conditions_and_contradictions(self):
        v=examples()['power_closed_unheld']
        self.assertEqual(reason(v)['status'],'provided')
        v['signals']={'power-on':1,'hold-brake':2,'power-off':3,'release-brake':4}
        self.assertEqual(reason(v)['status'],'provided')
        v['signals']={'open-door':3,'close-door':4}
        self.assertEqual(reason(v)['status'],'provided')
        # Local power/door still select the original branch; contradictory public evidence cannot explain it.
        for signals in [{'power-on':1},{'open-door':2}]:
            v['signals']=signals
            self.assertEqual(provider_decision(v).reason_id,'power_closed_unheld')
            self.assertEqual(reason(v)['status'],'omitted')

    def test_accept_requires_current_public_request_and_no_completed_transfer(self):
        original=examples()['accept_key_missing']
        for mutate in [lambda v:v['events'].clear(),
                       lambda v:v['events'][0].update(seat='west'),
                       lambda v:v['events'][0].update(text='PRIVATE_HANDOFF_SENTINEL'),
                       lambda v:v['signals'].update({'send-key':1})]:
            v=copy.deepcopy(original);mutate(v)
            self.assertEqual(reason(v)['status'],'omitted')
            self.assertIsNone(reason(v)['reason_id'])
        v=copy.deepcopy(original);v['rev']=6;v['events'].append({'id':6,'type':'decision','seat':'west'})
        self.assertEqual(reason(v)['status'],'omitted')

    def test_offer_requires_shared_key_and_causal_readiness_even_after_deferral(self):
        original=examples()['offer_key_ready']
        v=copy.deepcopy(original);v['shared']=[]
        self.assertEqual(provider_decision(v).reason_id,'offer_key_ready')
        self.assertEqual(reason(v)['status'],'omitted')
        v=copy.deepcopy(original);v['signals']={'send-key':1}
        self.assertEqual(reason(v)['status'],'omitted')
        v=copy.deepcopy(original);v['events'].append({'id':3,'seat':'west','type':'message','source':'human','text':'先等等'})
        d=provider_decision(v)
        self.assertNotEqual(d.reason_id,'offer_key_ready')
        old=provider_decision(original)
        self.assertEqual(project_reason(old.record(),v,old.command,'脚本 stub',[])['status'],'unverified')
        v=copy.deepcopy(original);v['events'].append({'id':3,'seat':'west','type':'decision','proposal':'send-key','proposer':'east','resolution':'decline'})
        v['events'].append({'id':4,'seat':'west','type':'inspect','text':'PRIVATE_HANDOFF_SENTINEL'})
        self.assertNotEqual(provider_decision(v).reason_id,'offer_key_ready')
        v['events'].append({'id':5,'seat':'west','type':'message','source':'human','text':'再提一次'})
        self.assertEqual(provider_decision(v).reason_id,'offer_key_ready')
        r=reason(v);self.assertEqual(r['status'],'provided')
        self.assertEqual([x['room_event'] for x in r['evidence'] if x['kind']=='public_event'],[5])

    def test_decline_supported_conditions_and_private_only_fallback(self):
        v=examples()['decline_local_safety']
        self.assertEqual(reason(v)['status'],'provided')
        v['signals']['hold-brake']=2
        # Actual local safety says decline, but public state contradicts that explanation.
        self.assertEqual(provider_decision(v).reason_id,'decline_local_safety')
        self.assertEqual(reason(v)['status'],'omitted')
        for braced,held in [(False,False),(True,True)]:
            v=base('east');v['local'].update(keyHere=False,braced=braced,holdingBrake=held)
            v['signals']={'brace':1,'hold-brake':2} if braced else {}
            pending(v,'open-door','west')
            self.assertEqual(provider_decision(v).reason_id,'decline_local_safety')
            self.assertEqual(reason(v)['status'],'provided')
        # Other fallback variants have no safe mapping yet, even though the branch ID is mapped.
        v=pending(base('east'),'send-key','west')
        self.assertEqual(provider_decision(v).reason_id,'decline_local_safety')
        self.assertEqual(reason(v)['status'],'omitted')
        self.assertNotIn('decline_local_safety',public_studio(trace(v,provider_decision(v).record()),'脚本 stub'))

if __name__=='__main__':unittest.main()
