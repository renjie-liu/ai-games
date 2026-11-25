"""Saved explicit reply -> SeatActor -> TacticalLoop -> token-authenticated Room.command.

Local loopback only, a one-shot in-memory replay provider (no SDK/network model client).
Outputs are durable public evidence, not new model capability evidence. Never runs smoke.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
from unittest.mock import patch
import urllib.request

from harness.config import config_hash
from harness.core.executor import Executor
from harness.core.loop import TacticalLoop
from harness.core.operator import OperatorQueue
from harness.providers import Completion, ProviderError
from harness.run_dir import RunDir
from harness.replay_html import replay_data
from seat_worker import SeatActor, SeatAPI, SeatAdapter, SeatGame, configuration
from public_trace import public_studio, public_trace
from seat_protocol import decode

ROOT=Path(__file__).resolve().parent
REPLAY_SOURCE='离线重放 · 历史模型回复（无新请求）'
FIXTURE_SOURCE='离线 fixture · 非真实模型'
REPLY=json.loads((ROOT/'fixtures/gemini-45fc946-public-reply.json').read_text())
TEXT=REPLY['public_reply_verbatim']
assert hashlib.sha256(TEXT.encode()).hexdigest()==REPLY['reply_sha256']
SAVED=decode(TEXT.split('\n',1)[1].rsplit('\n',1)[0])
PENDING=SAVED['actions'][0]['id']


class ReplayProvider:
    name='offline-saved-reply';capabilities=None
    def __init__(self,text,capabilities,source):
        self.text=text;self.capabilities=capabilities;self.calls=0;self.source=source
        self.name='offline-saved-reply' if source=='offline-replay' else 'offline-fixture'
    def complete(self,messages,max_tokens):
        self.calls+=1
        if self.calls>1:raise ProviderError('Offline replay exhausted; no external requests',retryable=False)
        return Completion(text=self.text,input_tokens=0,cached_tokens=0,output_tokens=0,latency_ms=0,
                          raw={'source':self.source})


def scenario_source(name,text,mode,seat):
    # Matching reply bytes alone does not make a changed scenario historical evidence.
    if name=='saved-exact':
        if (text,mode,seat)!=(TEXT,'pending','west'):
            raise ValueError('Historical replay requires the saved reply and original scenario')
        return 'offline-replay',REPLAY_SOURCE
    return 'offline-fixture',FIXTURE_SOURCE


def only_loopback(fn):
    original=socket.socket.connect
    def connect(sock,address):
        if not isinstance(address,tuple) or address[0] not in ('127.0.0.1','::1'):
            raise AssertionError('Offline replay refuses external network')
        return original(sock,address)
    with patch.object(socket.socket,'connect',connect):return fn()


def case(out,name,text=TEXT,mode='pending',seat='west',expected='applied',code='ok'):
    protocol_source,public_source=scenario_source(name,text,mode,seat)
    out=Path(out);out.mkdir(parents=True,exist_ok=False)
    server=subprocess.Popen(['node',str(ROOT/'offline_protocol_room.mjs'),mode,PENDING],
                            stdout=subprocess.PIPE,text=True,env={'PATH':os.environ['PATH']})
    try:
        ready=json.loads(server.stdout.readline());base=f"http://127.0.0.1:{ready['port']}"
        def req(role):
            r=urllib.request.Request(base,headers={'Authorization':'Bearer '+ready['tokens'][role]})
            with urllib.request.urlopen(r,timeout=5) as f:return json.load(f)
        before=req('watch')
        cfg,prices=configuration('script')
        cfg=cfg.model_copy(update={'budget':cfg.budget.model_copy(update={'steps_cap':1,'time_cap_s':10}),
                                  'provider_retries':cfg.provider_retries.model_copy(update={'max':0})})
        p=ReplayProvider(text,cfg.providers[cfg.roles['actor'].provider].capabilities,protocol_source)
        # Use a temp private run; public evidence never exports seat observations/prompts/tokens.
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ,
            PARTITION_ENDPOINT=base,PARTITION_SEAT_TOKEN=ready['tokens'][seat],PARTITION_CONTROLLER='model'):
            adapter=SeatAdapter(SeatAPI());game=SeatGame(adapter,seat)
            run=RunDir.create(Path(temp),protocol_source);adapter.log=run.log
            loop=TacticalLoop(cfg,game,{'default':p},run,OperatorQueue(),Executor(adapter,run.log,settle_ms=1),
                adapter=adapter,price_table=prices,config_hash=config_hash(cfg),
                actor=SeatActor(run.log,protocol_source),stall=False,per_game=run.path/'isolated-memory')
            try:
                result=loop.run_session('start',note=protocol_source+'; loopback test, no model request')
                end=result.reason
            except ValueError:
                # Preserve the existing strict adapter rejection. Do not turn it into success.
                if expected!='rejected' or not adapter.last_result or adapter.last_result.get('receipt',{}).get('code')!=code:raise
                end='adapter-rejected'

            data=replay_data(run,inline_frames=False)
            safe=public_trace(data,public_source);html=public_studio(data,public_source)
        after=req('watch');steps=safe['steps'];receipts=[s['public_receipt'] for s in steps if s['public_receipt']]
        if expected=='no-command':assert not receipts
        else:
            assert len(receipts)==1,receipts
            assert (receipts[0]['outcome'],receipts[0]['code'])==(expected,code),receipts
        if expected!='applied':
            assert (after['rev'],after['signals'],after['pending'],after['public'])==(
                before['rev'],before['signals'],before['pending'],before['public'])
        else:assert after['signals'].get('send-key') and after['pending'] is None
        assert 'PRIVATE_SENTINEL' not in html
        report={'case':name,'kind':public_source,'protocol_source':protocol_source,
            'reply_sha256':hashlib.sha256(text.encode()).hexdigest(),
            'byte_exact_saved_reply':text==TEXT,'original_reply_sha256':REPLY['reply_sha256'],
            'fixture_setup':'normal east inspect/share/send-key; pending ID seeded to saved ID before observation',
            'seat':seat,'provider_replay_calls':p.calls,'external_model_requests':0,
            'end':end,'before':before,'after':after,'public_trace':safe,
            'actual_outcome':receipts[0]['outcome'] if receipts else 'no-command',
            'world_unchanged':after['rev']==before['rev'],'tokens_exported':False}
        (out/'evidence.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        (out/'studio.html').write_text(html)
        return {k:report[k] for k in ('case','kind','protocol_source','byte_exact_saved_reply','provider_replay_calls','external_model_requests','end','actual_outcome','world_unchanged')}
    finally:
        server.terminate();server.wait(timeout=10);server.stdout.close()


def suite(out):
    rows=[]
    def run(name,**kwargs):rows.append(only_loopback(lambda:case(Path(out)/name,name,**kwargs)))
    run('saved-exact')
    run('stale',mode='stale',expected='waiting',code='stale_proposal')
    run('own-confirmation',seat='east',expected='rejected',code='permission_denied')
    bad={**SAVED,'actions':[{'type':'accept','id':'wrong-id'}]}
    run('wrong-id',text=json.dumps(bad,ensure_ascii=False),expected='waiting',code='stale_proposal')
    run('cross-seat',text=json.dumps({'type':'action','id':'hold-brake'}),mode='none',expected='rejected',code='permission_denied')
    run('rule-rejected',text=json.dumps({'type':'action','id':'unlock'}),mode='none',expected='rejected',code='rule_rejected')
    run('multiple',text=json.dumps({**SAVED,'actions':SAVED['actions']*2}),expected='no-command')
    run('unknown',text=json.dumps({'type':'teleport','id':'outside'}),expected='no-command')
    run('private-summary',text=json.dumps({**SAVED,'commentary':'PRIVATE_SENTINEL'}))
    wrapped={**SAVED,'actions':[{'type':'type','text':json.dumps(SAVED['actions'][0])}]}
    run('already-wrapped',text=json.dumps(wrapped,ensure_ascii=False))
    (Path(out)/'results.json').write_text(json.dumps({'network':'loopback only; SDK never constructed',
        'external_model_requests':0,'passed':len(rows),'failed':0,'cases':rows},ensure_ascii=False,indent=2))
    return rows


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--output',type=Path,required=True);args=ap.parse_args()
    args.output.mkdir(parents=True,exist_ok=False)
    print(json.dumps(suite(args.output),ensure_ascii=False,indent=2))
