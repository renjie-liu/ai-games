"""Offline actual Google SDK serialization/HTTP-path tests; no paid calls or credentials."""
import concurrent.futures
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from harness.config import load_config
from harness.pricing import PriceTable
from harness.providers import Message, ProviderError
from model_smoke import MODEL, ENDPOINT, bounded_config, initialize_fixture, Ledger, SmokeProvider
from seat_worker import configuration, ROOT


def config():
    cfg = load_config(ROOT/'config/example.yaml')
    d = cfg.model_dump()
    p = d['providers']['default']
    p.update(adapter='google', model=MODEL, base_url=ENDPOINT, api_key_env='OFFLINE_TEST_KEY',
             price_table_entry='smoke', google_thinking_level=None)
    d['roles'] = {'actor': d['roles']['actor']}
    d['budget'] = dict(usd_cap=.05, time_cap_s=180, steps_cap=1, provider_units_cap=None)
    return type(cfg).model_validate(d)


PRICES = PriceTable(version='offline-test-rates', entries={'smoke':dict(
    input_per_m=.75, cached_per_m=.075, output_per_m=3.75, image_each=0)})
MESSAGES = [Message(role='user', text='OFFLINE_PRIVATE_SENTINEL')]
def success(request):
    return httpx.Response(200,json={'candidates':[{'content':{'role':'model','parts':[{'text':'{"actions":[]}'}]},'finishReason':'STOP'}],
        'usageMetadata':{'promptTokenCount':12,'candidatesTokenCount':5,'thoughtsTokenCount':3,'totalTokenCount':20}})


class SmokeLimitsTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.path=Path(self.tmp.name)/'ledger.json';self.cfg=bounded_config(config())
    def provider(self, handler=success, cfg=None):
        cfg=cfg or self.cfg
        if not self.path.exists():initialize_fixture(self.path,cfg,PRICES)
        p=SmokeProvider(cfg,PRICES,Ledger(self.path,cfg,PRICES),
                        transport=httpx.MockTransport(handler),api_key='offline-test-not-a-key')
        self.addCleanup(p.close);return p
    def ledger(self):return json.loads(self.path.read_text())

    def test_worker_preserves_stricter_config_and_all_budget_dimensions(self):
        import yaml
        d=config().model_dump(mode='json');d['budget']=dict(usd_cap=.01,time_cap_s=9,steps_cap=1,provider_units_cap=None)
        d['actor_max_tokens']=128;d['providers']['default']['timeout_s']=7
        cp=Path(self.tmp.name)/'config.yaml';cp.write_text(yaml.safe_dump(d))
        pp=Path(self.tmp.name)/'prices.yaml';pp.write_text(yaml.safe_dump(PRICES.model_dump()))
        with patch.dict(os.environ,PARTITION_ALLOW_MODEL='1',PARTITION_MODEL_CONFIG=str(cp),PARTITION_PRICE_TABLE=str(pp)):
            cfg,_=configuration('model')
        self.assertEqual(cfg.budget.model_dump(),d['budget'])
        self.assertEqual(cfg.actor_max_tokens,128);self.assertEqual(cfg.providers['default'].timeout_s,7)
        self.assertEqual(cfg.provider_retries.max,0);self.assertEqual(set(cfg.roles),{'actor'})
        # Harness rejects unsupported provider-unit caps; do not silently erase one.
        d['budget']['provider_units_cap']=.2;cp.write_text(yaml.safe_dump(d))
        with patch.dict(os.environ,PARTITION_ALLOW_MODEL='1',PARTITION_MODEL_CONFIG=str(cp),PARTITION_PRICE_TABLE=str(pp)):
            with self.assertRaises(ValueError):configuration('model')

    def test_looser_caps_are_clamped_not_copied(self):
        d=config().model_dump();d['budget'].update(usd_cap=2,time_cap_s=7200,steps_cap=2000)
        c=bounded_config(type(config()).model_validate(d))
        self.assertEqual((c.budget.usd_cap,c.budget.time_cap_s,c.budget.steps_cap),(.5,180,1))
        self.assertEqual(c.actor_max_tokens,1024)

    def test_success_second_call_and_restarted_worker_share_one_send(self):
        sent=[]
        def handle(r):sent.append(r);return success(r)
        p=self.provider(handle);c=p.complete(MESSAGES,128)
        self.assertEqual(c.output_tokens,8)
        for provider in (p,self.provider(handle)):
            with self.assertRaises(ProviderError):provider.complete(MESSAGES,128)
        self.assertEqual(len(sent),1)
        self.assertEqual(len(self.ledger()['attempts']),1)
        self.assertEqual(len(self.ledger()['blocked']),2)
        self.assertNotIn('OFFLINE_PRIVATE_SENTINEL',self.path.read_text())
        self.assertNotIn('offline-test-not-a-key',self.path.read_text())
        self.assertAlmostEqual(self.ledger()['attempts'][0]['estimated_cost_usd'],.000039)

    def test_500_timeout_unreadable_and_redirect_never_retry(self):
        for mode in ['500','timeout','unreadable','redirect']:
            with self.subTest(mode=mode):
                self.path=Path(self.tmp.name)/(mode+'.json');sent=[]
                def handle(r):
                    sent.append(r)
                    if mode=='timeout':raise httpx.ReadTimeout('PRIVATE_ERROR_SENTINEL')
                    if mode=='500':return httpx.Response(500,json={'error':{'code':500,'message':'PRIVATE_ERROR_SENTINEL','status':'INTERNAL'}})
                    if mode=='redirect':return httpx.Response(302,headers={'Location':'https://unauthorized.example/'})
                    return httpx.Response(200,json={'unexpected':'PRIVATE_ERROR_SENTINEL'})
                p=self.provider(handle)
                for _ in range(2):
                    with self.assertRaises(ProviderError) as caught:p.complete(MESSAGES,128)
                    self.assertFalse(caught.exception.retryable)
                    self.assertNotIn('PRIVATE_ERROR_SENTINEL',str(caught.exception))
                self.assertEqual(len(sent),1);self.assertEqual(len(self.ledger()['attempts']),1)
                self.assertNotIn('usage',self.ledger()['attempts'][0])

    def test_sdk_retry_even_if_reenabled_is_counted_and_blocked(self):
        import tenacity
        sent=[]
        def handle(r):sent.append(r);return httpx.Response(500,json={'error':{'code':500,'message':'offline','status':'INTERNAL'}})
        p=self.provider(handle)
        # Deliberately violate our SDK no-retry setting: transport guard still prevents send #2.
        p.provider._client._api_client._retry=tenacity.Retrying(stop=tenacity.stop_after_attempt(3),
            wait=tenacity.wait_none(),retry=tenacity.retry_if_exception_type(Exception),reraise=True)
        with self.assertRaises(ProviderError):p.complete(MESSAGES,128)
        self.assertEqual(len(sent),1);self.assertEqual(len(self.ledger()['blocked']),2)

    def test_concurrent_workers_cannot_both_send(self):
        sent=[]
        def handle(r):sent.append(r);return success(r)
        a,b=self.provider(handle),self.provider(handle)
        def call(p):
            try:p.complete(MESSAGES,128);return True
            except ProviderError:return False
        with concurrent.futures.ThreadPoolExecutor(2) as pool:results=list(pool.map(call,[a,b]))
        self.assertEqual(sorted(results),[False,True]);self.assertEqual(len(sent),1)

    def test_deadline_or_preflight_cost_blocks_before_send(self):
        for mode in ['deadline','cost']:
            with self.subTest(mode=mode):
                self.path=Path(self.tmp.name)/(mode+'.json');sent=[]
                p=self.provider(lambda r:sent.append(r) or success(r))
                if mode=='deadline':p.ledger.edit(lambda d:d.update(deadline=0))
                messages=MESSAGES if mode=='deadline' else [Message(role='user',text='x'*100000)]
                with self.assertRaises(ProviderError):p.complete(messages,128)
                self.assertEqual(sent,[]);self.assertEqual(self.ledger()['attempts'],[])

    def test_ledger_cannot_be_reset_or_relaxed(self):
        initialize_fixture(self.path,self.cfg,PRICES)
        with self.assertRaises(FileExistsError):initialize_fixture(self.path,self.cfg,PRICES)
        d=self.cfg.model_dump();d['budget']['usd_cap']=.5
        with self.assertRaises(ValueError):Ledger(self.path,type(self.cfg).model_validate(d),PRICES)

    def test_endpoint_and_output_limits_fail_closed(self):
        sent=[];p=self.provider(lambda r:sent.append(r) or success(r))
        with self.assertRaises(ProviderError):p.complete(MESSAGES,2048)
        self.assertEqual(sent,[])
        p.provider._client._api_client._http_options.base_url='https://unauthorized.example'
        with self.assertRaises(ProviderError):p.complete(MESSAGES,128)
        self.assertEqual(sent,[])

    def test_real_tactical_loop_stops_after_one_mocked_http_exchange(self):
        self.harness_case(valid=True)

    def test_protocol_repair_attempt_cannot_send_second_request(self):
        # Unknown command must still trigger repair refusal at the one-request guard.
        self.harness_case(valid=False)

    def test_public_smoke_audit_separates_network_and_local_rejection(self):
        from public_trace import public_trace, public_studio
        d={'header':{},'steps':[{'calls':[{'outcome':'text','seq':6,'response':'PRIVATE_SENTINEL'},
                                        {'outcome':'error','seq':9}], 'chunk':None}],
           'smoke_transport':{'http_attempts':1,'http_responses':1,'retries':0,'blocked_before_send':1,
                'usage_estimate_usd':.0025425,'unknown_billing_attempts':0,'budget_usd':.05,'api_key':'PRIVATE_SENTINEL'}}
        safe=public_trace(d,'真实模型 · public-safe');html=public_studio(d,'真实模型 · public-safe')
        self.assertEqual(safe['smoke_transport']['http_attempts'],1)
        self.assertEqual(safe['steps'][0]['public_reason']['status'],'unverified')
        self.assertIn('未通过动作协议解析',safe['steps'][0]['public_reason']['text'])
        self.assertNotIn('PRIVATE_SENTINEL',html)
        self.assertNotIn('smoke_transport',public_trace(d,'脚本 stub'))

    def harness_case(self, valid):
        """Full harness/API lifecycle, SDK wire mocked; this is NOT model evidence."""
        import socket, subprocess, time, urllib.request
        from urllib.parse import urlsplit,parse_qs
        from seat_worker import SeatAPI,SeatAdapter,SeatGame,SeatActor,NoInternalPayloadProvider
        from harness.core.loop import TacticalLoop
        from harness.core.operator import OperatorQueue
        from harness.core.executor import Executor
        from harness.run_dir import RunDir
        from harness.config import config_hash
        with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
        base=f'http://127.0.0.1:{port}'
        server=subprocess.Popen(['node','server3d.mjs'],cwd=Path(__file__).resolve().parent,
            env={**os.environ,'PORT':str(port),'PARTITION_ALLOW_MODEL':'0'},stdout=subprocess.DEVNULL)
        self.addCleanup(lambda:(server.terminate(),server.wait(timeout=10)))
        def req(path,token=None,data=None):
            headers={'Content-Type':'application/json'}
            if token:headers['Authorization']='Bearer '+token
            r=urllib.request.Request(base+path,headers=headers,data=None if data is None else json.dumps(data).encode())
            with urllib.request.urlopen(r,timeout=10) as f:return json.load(f)
        for _ in range(80):
            try:req('/api/capabilities');break
            except OSError:time.sleep(.05)
        room=req('/api/rooms',data={'controllers':{'west':'human','east':'human'}})
        token={s:parse_qs(urlsplit(link).fragment)['key'][0] for s,link in room['links'].items()}
        path='/api/rooms/'+room['id']
        req(path+'/command',token['east'],{'type':'action','id':'send-key'})
        pending=req(path,token['west'])['pending'];sent=[]
        def handle(r):
            sent.append(r)
            action={'type':'accept' if valid else 'unsupported','id':pending['id']}
            answer=json.dumps({'commentary':'','actions':[{'type':'type','text':json.dumps(action)} if valid else action]})
            if not valid:answer='```json\n'+answer+'\n```'
            return httpx.Response(200,json={'candidates':[{'content':{'role':'model','parts':[{'text':answer}]}}],
                'usageMetadata':{'promptTokenCount':12,'candidatesTokenCount':30,'totalTokenCount':42}})
        provider=self.provider(handle)
        with patch.dict(os.environ,PARTITION_ENDPOINT=base+path,PARTITION_SEAT_TOKEN=token['west'],PARTITION_CONTROLLER='model'):
            adapter=SeatAdapter(SeatAPI());game=SeatGame(adapter,'west')
            run=RunDir.create(Path(self.tmp.name)/'run','offline-smoke');adapter.log=run.log
            loop=TacticalLoop(self.cfg,game,{'default':NoInternalPayloadProvider(provider)},run,OperatorQueue(),
                Executor(adapter,run.log,settle_ms=1),adapter=adapter,price_table=PRICES,
                config_hash=config_hash(self.cfg),actor=SeatActor(run.log,'offline-fixture'),stall=False,per_game=run.path/'isolated-memory')
            result=loop.run_session('start',note='OFFLINE HTTP fixture, NOT a real model')
        self.assertEqual(result.reason,'budget' if valid else 'error')
        self.assertEqual(len(sent),1);self.assertEqual(len(self.ledger()['attempts']),1)
        self.assertEqual(bool(req(path,token['watch'])['signals'].get('send-key')),valid)
        self.assertEqual(len(self.ledger()['blocked']),0 if valid else 1)


if __name__=='__main__':unittest.main()
