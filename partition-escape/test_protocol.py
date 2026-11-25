import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from harness.actions.parse import ChunkParseError
from harness.providers import Completion
from harness.log.events import EventLog
from seat_protocol import normalize, safe_audit, VERSION
from seat_worker import SeatActor
from model_smoke import AUTHORIZATION_LEDGER, initialize_fixture, authorized_ledger, Ledger, SmokeProvider
from test_model_smoke import config, PRICES, bounded_config
from offline_protocol_check import TEXT, SAVED, suite, scenario_source


class ProtocolTests(unittest.TestCase):
    def test_saved_reply_only_changes_wrapper_and_preserves_summary_id(self):
        raw,a=normalize(TEXT);obj=json.loads(raw)
        self.assertTrue(a['normalized']);self.assertEqual(a['input_format'],'actions-command')
        self.assertEqual(json.loads(obj['actions'][0]['text']),SAVED['actions'][0])
        self.assertEqual(obj['commentary'],SAVED['commentary'])

    def test_all_seven_command_shapes_and_native_wrapper(self):
        for kind in ('inspect','share','action','accept','decline','cancel','say'):
            c={'type':kind, 'text' if kind=='say' else 'id':'sample'}
            raw,a=normalize(json.dumps(c));self.assertTrue(a['normalized'])
            wrapped,b=normalize(raw);self.assertFalse(b['normalized']);self.assertEqual(raw,wrapped)

    def test_invalid_multi_unknown_extra_and_nested_payloads_never_pass(self):
        examples=[{},[],{'type':[],'id':'x'},{'type':'unknown','id':'x'},
            {'type':'accept','id':1},{'type':'accept','id':''},{'type':'accept','id':'x','seat':'east'},
            {'type':'say','text':' '},{'type':'say','text':'x'*501},
            {'actions':[]},{'actions':[SAVED['actions'][0]]*2},
            {'actions':[SAVED['actions'][0]],'commentary':{}},
            {'actions':[SAVED['actions'][0]],'normalized':True},
            {'actions':[{'type':'type','text':'[]'}]},
            {'actions':[{'type':'type','text':json.dumps({'type':'accept','id':'x','sudo':True})}]}]
        for obj in examples:
            with self.subTest(obj=obj),self.assertRaises(ChunkParseError):normalize(json.dumps(obj))
        for raw in ['{"type":"accept","type":"cancel","id":"x"}',TEXT+'\n'+TEXT,
                    'prefix '+TEXT,'{"actions":[{"type":"accept","id":NaN}]}']:
            with self.assertRaises(ChunkParseError):normalize(raw)

    def test_audit_is_request_linked_and_never_exposes_arguments(self):
        with tempfile.TemporaryDirectory() as tmp:
            log=EventLog(Path(tmp)/'events.jsonl');log.append({'type':'run_header'})
            log.append({'type':'inference_request','role':'actor','request_id':'r1'})
            actor=SeatActor(log,'offline-replay')
            c=Completion(text='{"type":"say","text":"PRIVATE_SENTINEL"}',input_tokens=0,cached_tokens=0,output_tokens=0,latency_ms=0,raw={})
            actor.proposal(c);a=log.last(lambda r:r.get('channel')=='partition_protocol')
            self.assertEqual(a['request_id'],'r1');self.assertTrue(a['normalized'])
            self.assertNotIn('PRIVATE_SENTINEL',json.dumps(a));self.assertEqual(a['source'],'offline-replay')
            c=Completion(text='PRIVATE_SENTINEL',input_tokens=0,cached_tokens=0,output_tokens=0,latency_ms=0,raw={})
            with self.assertRaises(ChunkParseError):actor.proposal(c)
            self.assertEqual(log.last(lambda r:r.get('channel')=='partition_protocol')['status'],'rejected')

    def test_public_audit_rejects_untrusted_fields_and_versions(self):
        a=dict(version=VERSION,source='offline-replay',normalized=True,status='accepted',input_format='bare-command')
        self.assertEqual(safe_audit({**a,'private':'PRIVATE_SENTINEL'}),a)
        for changes in ({'version':'unknown'},{'source':'PRIVATE_SENTINEL'},{'normalized':1},{'input_format':'PRIVATE_SENTINEL'}):
            self.assertIsNone(safe_audit({**a,**changes}))

    def test_prompt_menu_and_legacy_fixture_still_work(self):
        from trace_fixture import fixture
        from public_trace import public_trace
        from types import SimpleNamespace
        context=SimpleNamespace(observation=SimpleNamespace(state_text=json.dumps({'signals':{},'pending':None})))
        messages=SeatActor().request(context,None)
        menu=json.loads(messages[1].text)['_public_summary_choices']
        self.assertTrue(all(set(x)=={'label','choices'} for x in menu))
        self.assertIn('Complete example:',messages[0].text)
        self.assertEqual([s['public_reason']['status'] for s in public_trace(fixture(),'离线 fixture · 非真实模型')['steps']],
                         ['provided','omitted','not_provided'])

    def test_fixed_spent_authorization_cannot_be_reset_by_new_output_or_ledger(self):
        # Synthetic exhausted grant, never a copy of a user's authorization record.
        cfg=bounded_config(config())
        with tempfile.TemporaryDirectory() as tmp:
            spent=(Path(tmp)/'spent.json').resolve()
            spent.write_text(json.dumps({'authorization_id':'partition-20261114-single-request',
                'offline_fixture':False,'request_cap':1,'attempts':[{'source':'synthetic-consumed-grant'}]}))
            before=spent.read_bytes()
            with patch('model_smoke.AUTHORIZATION_LEDGER',spent):
                for i in range(2):
                    p=Path(tmp)/str(i);p.mkdir();fresh=p/'requests.json'
                    initialize_fixture(fresh,cfg,PRICES)
                    with patch.dict(os.environ,PARTITION_MODEL_LEDGER=str(fresh)),patch('model_smoke.make_provider') as make:
                        with self.assertRaisesRegex(ValueError,'Alternate authorization'):authorized_ledger(cfg,PRICES)
                        with self.assertRaisesRegex(ValueError,'Alternate authorization'):SmokeProvider(cfg,PRICES,Ledger(fresh,cfg,PRICES))
                        make.assert_not_called()
                with patch.dict(os.environ,PARTITION_MODEL_LEDGER=str(spent)):
                    with self.assertRaisesRegex(ValueError,'exhausted'):authorized_ledger(cfg,PRICES)
            self.assertEqual(spent.read_bytes(),before)

    def test_runner_checks_missing_grant_before_output_or_server(self):
        import model_smoke_run
        with tempfile.TemporaryDirectory() as tmp:
            missing=(Path(tmp)/'missing-ledger.json').resolve()
            for name in ('output-a','output-b'):
                out=Path(tmp)/name
                with patch('sys.argv',['model_smoke_run.py','--execute-one','--output',str(out)]), \
                     patch('model_smoke_run.configuration',return_value=(bounded_config(config()),PRICES)), \
                     patch('model_smoke.AUTHORIZATION_LEDGER',missing), \
                     patch.dict(os.environ,PARTITION_MODEL_LEDGER=str(missing)), \
                     patch('model_smoke_run.subprocess.Popen') as start:
                    with self.assertRaisesRegex(ValueError,'Authorization required'):model_smoke_run.main()
                    start.assert_not_called();self.assertFalse(out.exists());self.assertFalse(missing.exists())

    def test_real_transport_cannot_be_passed_as_offline_fixture(self):
        import httpx
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'fixture.json';cfg=bounded_config(config());initialize_fixture(p,cfg,PRICES)
            with httpx.HTTPTransport() as transport,patch('model_smoke.make_provider') as make:
                with self.assertRaisesRegex(ValueError,'MockTransport'):SmokeProvider(cfg,PRICES,Ledger(p,cfg,PRICES),transport=transport)
                make.assert_not_called()

    def test_historical_source_requires_exact_reply_and_original_scenario(self):
        self.assertEqual(scenario_source('saved-exact',TEXT,'pending','west')[0],'offline-replay')
        for text,mode,seat in ((TEXT+' ','pending','west'),(TEXT,'stale','west'),(TEXT,'pending','east')):
            with self.assertRaises(ValueError):scenario_source('saved-exact',text,mode,seat)
        for name,mode,seat in (('stale','stale','west'),('own-confirmation','pending','east')):
            self.assertEqual(scenario_source(name,TEXT,mode,seat)[0],'offline-fixture')

    def test_replay_notice_is_fixed_and_only_on_historical_source(self):
        from public_trace import public_trace, SOURCES, HISTORICAL_REPLAY_NOTICE
        for source in SOURCES:
            projected=public_trace({'replay_notice':'PRIVATE_SENTINEL'},source)
            self.assertNotIn('PRIVATE_SENTINEL',json.dumps(projected))
            if source=='离线重放 · 历史模型回复（无新请求）':
                self.assertEqual(projected['replay_notice'],HISTORICAL_REPLAY_NOTICE)
            else:self.assertNotIn('replay_notice',projected)

    def test_harness_engine_regression_and_public_projection(self):
        with tempfile.TemporaryDirectory() as tmp:
            rows=suite(tmp);self.assertEqual(len(rows),10)
            for row in rows:
                d=json.loads((Path(tmp)/row['case']/'evidence.json').read_text());steps=d['public_trace']['steps']
                audits=[a for s in steps for a in s['public_protocol']]
                self.assertTrue(audits);self.assertEqual(d['external_model_requests'],0)
                historical=row['case']=='saved-exact'
                source='offline-replay' if historical else 'offline-fixture'
                self.assertEqual(row['protocol_source'],source)
                self.assertTrue(all(a['source']==source for a in audits))
                html=(Path(tmp)/row['case']/'studio.html').read_text()
                self.assertNotIn('PRIVATE_SENTINEL',html)
                if historical:
                    self.assertIn('45fc946 原真实请求因动作格式不符，机关执行 0 次',d['public_trace']['replay_notice'])
                    self.assertIn('不代表新增真实合作',d['public_trace']['replay_notice'])
                else:
                    self.assertNotIn('replay_notice',d['public_trace'])
                    for s in steps:
                        self.assertEqual(s['public_reason']['source'],'离线 fixture · 非真实模型')
                        self.assertNotIn('历史回复',s['public_reason']['label'])
                    self.assertNotIn('历史回复的可公开摘要',html)
                if row['case']=='already-wrapped':self.assertFalse(audits[0]['normalized'])
                elif row['case'] in ('multiple','unknown'):self.assertEqual(audits[0]['status'],'rejected')
                else:self.assertTrue(audits[0]['normalized'])
                if row['case'] in ('private-summary','own-confirmation'):self.assertEqual(steps[0]['public_reason']['status'],'omitted')
                if row['case']=='saved-exact':
                    self.assertTrue(row['byte_exact_saved_reply']);self.assertEqual(row['provider_replay_calls'],1)
                    self.assertEqual(steps[0]['public_reason']['text'],SAVED['commentary'])
                    self.assertTrue(steps[0]['public_receipt']['roomEventIds'])


if __name__=='__main__':unittest.main()
