import json
import os
import unittest
from unittest.mock import patch
from types import SimpleNamespace
from script_policy import script_decision, provider_decision, POLICY_VERSION
from seat_worker import ScriptProvider
from decision_reasons import project_reason
from public_trace import public_trace, public_studio, summary_options

def view():
    return {'paused':False,'complete':False,'role':'east','pending':None,'scene':[],'notes':[{'id':'brace-found'}],
            'shared':[{'id':'brace-found'}],'messages':[],'events':[],
            'signals':{'power-on':10,'hold-brake':12,'power-off':14},
            'local':{'keyHere':False,'braceSeen':True,'gateOpen':True,'holdingBrake':True,'fanSpinning':False,'braced':False}}

def trace(v,raw,command=None):
    command=command if command is not None else provider_decision(v).command
    return {'header':{'run_id':'branch-fixture'},'events':[],'steps':[{
        'observation':{'observation_id':'o1','seq':1,'ts':1,'trigger':'fixture','state_text':json.dumps(v)},
        'chunk':{'chunk_id':'c1','seq':3,'commentary':raw,'actions':[{'type':'type','text':json.dumps(command)}]},
        'calls':[{'request_id':'r1','seq':2,'role':'actor'}],'results':[]}]}

class BranchReasonTests(unittest.TestCase):
    def test_same_accept_action_has_different_actual_causes_and_priority(self):
        v=view();v['pending']={'from':'west','action':'power-off','id':'p1'}
        v['local']['braced']=True;v['signals']['brace']=15
        held=script_decision(v)
        self.assertEqual(held.reason_id,'accept_power_brake')
        # The same command now comes from the other side of the original OR condition.
        v['local']['holdingBrake']=False;v['signals']['release-brake']=16
        braced=script_decision(v)
        self.assertEqual(held.command,braced.command)
        self.assertEqual(braced.reason_id,'accept_power_braced')
        reason=project_reason(braced.record(),v,braced.command,'脚本 stub',[])
        self.assertEqual(reason['reason_id'],'accept_power_braced')
        self.assertIn('不是依靠手闸',reason['text'])
        # Substituting the old reason ID for the SAME action must fail validation.
        wrong=project_reason(held.record(),v,braced.command,'脚本 stub',[])
        self.assertEqual(wrong['status'],'unverified')
        self.assertIsNone(wrong['reason_id'])

    def test_provider_records_branch_when_deciding_not_action_selected_template(self):
        v=view()
        with patch.dict(os.environ,{'PARTITION_STEP_DELAY':'0'}):
            body=json.loads(ScriptProvider(None).complete([SimpleNamespace(text=json.dumps(v))],100).text)
        d=script_decision(v);self.assertEqual(json.loads(body['commentary'])['reason_id'],d.reason_id)
        self.assertEqual(json.loads(body['actions'][0]['text']),d.command)
        safe=public_trace(trace(v,body['commentary']),'脚本 stub')['steps'][0]
        r=safe['public_reason']
        self.assertEqual(r['status'],'provided');self.assertEqual(r['reason_id'],'brace_stopped_held')
        self.assertEqual(r['evidence'][-1]['fact_id'],'brace-found')
        self.assertEqual([x['room_event'] for x in r['evidence'] if x['kind']=='public_action'],[12,14])
        self.assertTrue(r['trigger_rule_recorded'])
        self.assertEqual(safe['public_execution']['state'],'unknown')

    def test_earlier_branch_and_mutated_observation_cannot_reuse_cause(self):
        v=view();d=script_decision(v)
        v['scene']=[{'id':'fan','inspected':False}]
        self.assertEqual(script_decision(v).reason_id,'inspect_unseen')
        r=project_reason(d.record(),v,d.command,'脚本 stub',[])
        self.assertEqual(r['status'],'unverified')
        v['scene']=[];v['local']['fanSpinning']=True
        self.assertEqual(script_decision(v).reason_id,'report_brake_fan')
        self.assertEqual(project_reason(d.record(),v,d.command,'脚本 stub',[])['status'],'unverified')

    def test_mapped_branch_without_public_evidence_is_omitted_including_id(self):
        v=view();v['pending']={'from':'west','action':'power-off','id':'p1'}
        v['signals']={};v['notes'].append({'id':'PRIVATE_SENTINEL','text':'PRIVATE_SENTINEL'})
        d=script_decision(v)
        safe=public_trace(trace(v,d.record()),'脚本 stub')
        reason=safe['steps'][0]['public_reason']
        self.assertEqual(reason['status'],'omitted')
        self.assertIn('当前公开证据不足',reason['text'])
        self.assertTrue(reason['trigger_rule_recorded'])
        self.assertIsNone(reason['reason_id'])
        html=public_studio(trace(v,d.record()),'脚本 stub')
        self.assertNotIn('PRIVATE_SENTINEL',html)
        self.assertNotIn('accept_power_brake',html)

    def test_unmapped_branches_do_not_claim_private_evidence(self):
        cases=[]
        v=view();v['scene']=[{'id':'PRIVATE_SENTINEL','inspected':False}]
        cases.append(('inspect_unseen',v))
        v=view();v['notes'].append({'id':'PRIVATE_SENTINEL','text':'PRIVATE_SENTINEL'})
        cases.append(('share_unshared',v))
        for branch,v in cases:
            with self.subTest(branch=branch):
                d=provider_decision(v);self.assertEqual(d.reason_id,branch)
                raw=trace(v,d.record());safe=public_trace(raw,'脚本 stub')
                r=safe['steps'][0]['public_reason']
                self.assertEqual(r['status'],'unmapped')
                self.assertEqual(r['status_label'],'未映射公开说明')
                self.assertIn('尚未配置公开解释',r['text'])
                self.assertIn('未进行公开证据核验',r['validation'])
                self.assertNotIn('公开证据不足',r['text'])
                self.assertTrue(r['trigger_rule_recorded'])
                self.assertIsNone(r['reason_id']);self.assertIsNone(r['policy_version'])
                self.assertEqual(r['evidence'],[])
                html=public_studio(raw,'脚本 stub')
                self.assertNotIn(branch,html);self.assertNotIn('PRIVATE_SENTINEL',html)

    def test_public_support_requires_shared_fact_not_merely_private_note(self):
        v=view();v['shared']=[];d=script_decision(v)
        # Share branch wins now. For a branch fixture without a pending note, retain the
        # private observation, not the shared fact; no public explanation is fabricated.
        v['notes']=[];v['local']['braceSeen']=False;d=script_decision(v)
        self.assertEqual(d.reason_id,'brace_stopped_held')
        self.assertEqual(project_reason(d.record(),v,d.command,'脚本 stub',[])['status'],'omitted')
        v['shared']=[{'id':'brace-found','text':'PRIVATE_SENTINEL'}]
        r=project_reason(d.record(),v,d.command,'脚本 stub',[])
        self.assertEqual(r['status'],'provided')
        self.assertNotIn('PRIVATE_SENTINEL',json.dumps(r))

    def test_missing_legacy_unknown_or_unsafe_record_never_gets_reconstructed(self):
        v=view();d=script_decision(v)
        for raw,status in [('', 'not_provided'),('legacy public template','unverified'),
                           (json.dumps({'kind':'script_rule','policy_version':POLICY_VERSION,'reason_id':'PRIVATE_SENTINEL'}),'unverified')]:
            r=project_reason(raw,v,d.command,'脚本 stub',[])
            self.assertEqual(r['status'],status);self.assertIsNone(r['reason_id'])
            self.assertNotIn('PRIVATE_SENTINEL',json.dumps(r))
        r=project_reason(d.record(),v,d.command,'UNKNOWN PRIVATE_SENTINEL',[])
        self.assertEqual(r['status'],'unverified')
        # public_trace normalizes source, so an arbitrary origin cannot leak via label/source.
        self.assertNotIn('PRIVATE_SENTINEL',public_studio(trace(v,d.record()),'UNKNOWN PRIVATE_SENTINEL'))

    def test_models_and_fixtures_are_not_script_branch_records(self):
        v=view();d=script_decision(v);good=summary_options(v,d.command)[0]
        for source,kind in [('真实模型 · public-safe','model_summary'),('离线 fixture · 非真实模型','fixture_model_summary')]:
            for raw,status in [(good,'provided'),('', 'not_provided'),(good+' PRIVATE_SENTINEL','omitted'),(d.record(),'omitted')]:
                r=project_reason(raw,v,d.command,source,[good])
                self.assertEqual(r['status'],status);self.assertEqual(r['kind'],kind)
                self.assertFalse(r['trigger_rule_recorded']);self.assertIsNone(r['reason_id'])
                self.assertNotIn('PRIVATE_SENTINEL',json.dumps(r))
                if source.startswith('离线'):self.assertIn('未调用模型',r['label'])

    def test_recorded_branch_with_contradicting_public_signals_is_not_published(self):
        v=view();d=script_decision(v)
        v['signals']['release-brake']=20
        # Actual local selection unchanged, but public support contradicts it.
        self.assertEqual(script_decision(v),d)
        self.assertEqual(project_reason(d.record(),v,d.command,'脚本 stub',[])['status'],'omitted')

if __name__=='__main__':unittest.main()
