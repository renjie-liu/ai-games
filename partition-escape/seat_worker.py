"""One process, one seat credential, one REAL TacticalLoop. Default provider is a labelled script.

No world imports, peer credential, filesystem game state or engine answers are available to the policy.
The adapter is a virtual text/action seat, NOT vision control of the browser's 3D canvas.
"""
from __future__ import annotations
import argparse
from dataclasses import replace
import hashlib
import json
import os
from pathlib import Path
import time
import threading
import signal
import urllib.request

import cv2
import numpy as np
from harness.config import load_config, config_hash
from harness.core.executor import Executor
from harness.core.frame import make_frame
from harness.core.loop import TacticalLoop
from harness.core.manifest import Manifest
from harness.core.operator import OperatorQueue
from harness.games.base import Milestone
from harness.pricing import PriceTable
from harness.providers import Message, Completion
from harness.run_dir import RunDir
from harness.replay_html import replay_data
from public_trace import public_trace, public_studio, summary_menu, RECOVERABLE

from script_policy import script_command, provider_decision, proposal_intent, peer_ready
from model_smoke import bounded_config, authorized_ledger, SmokeProvider
from seat_protocol import normalize, VERSION, SOURCES

from harness_paths import HARNESS_ROOT as ROOT

class SeatActor:
    version='partition-seat-text-v2'
    def __init__(self, log=None, source='offline-fixture'):
        if source not in SOURCES: raise ValueError('Unknown protocol source')
        self.log, self.source = log, source
    def request(self, context, media):
        return [Message(role='system',text=(
            'You are one participant in a cooperative escape room. Explore your own objects proactively. '
            'You know only this observation and deliberately shared messages. Never invent facts or success. '
            'Choose commentary verbatim from _public_summary_choices for your action, or leave it empty. '
            'Never add private facts or internal thinking to commentary. '
            'Return JSON {"commentary":"brief public-safe action summary",'
            '"actions":[{"type":"type","text":"JSON command"}]}. Exactly one action. '
            'Complete example: '+json.dumps({'commentary':'','actions':[{'type':'type','text':json.dumps({'type':'inspect','id':'hatch'})}]})+'. '
            'Commands inside text: {type:inspect,id:object id}, {type:share,id:discovered note id}, {type:action,id:own action id}, '
            '{type:say,text:message to partner}, {type:accept or decline,id:pending id}, {type:cancel,id:own pending id}. '
            'Choose your own investigation. Shared power-off/open-door/send-key waits for your partner. Respect deferred proposals and do not repeatedly request them without new input. '
            'A message is communication, not an engine command. Never pretend another seat has acted.')),
            Message(role='user',text=json.dumps({**json.loads(context.observation.state_text),
                '_public_summary_choices':summary_menu(json.loads(context.observation.state_text))},ensure_ascii=False))]
    def proposal(self, completion):
        audit={'normalized':False,'status':'rejected','input_format':'invalid'}
        try:
            proposal,audit=normalize(completion.text)
            return proposal
        finally:
            if self.log is not None:
                request=self.log.last(lambda r:r.get('type')=='inference_request' and r.get('role')=='actor')
                self.log.append({'type':'progress','channel':'partition_protocol',
                    'request_id':request.get('request_id') if request else None,
                    **audit,'version':VERSION,'source':self.source})

class ScriptProvider:
    name='partition-script-stub'
    def __init__(self, capabilities): self.capabilities=capabilities
    def complete(self,messages,max_tokens):
        delay=float(os.environ.get('PARTITION_STEP_DELAY','0.8'));time.sleep(delay)
        v=json.loads(messages[-1].text)
        decision=provider_decision(v);c=decision.command
        answer={'commentary':decision.record(),
                'actions':[{'type':'type','text':json.dumps(c,ensure_ascii=False)}]}
        return Completion(text=json.dumps(answer,ensure_ascii=False),input_tokens=0,cached_tokens=0,
                          output_tokens=0,latency_ms=delay*1000,raw={'source':'script-stub'})

class NoInternalPayloadProvider:
    """Retain the explicit action reply and accurate billing, not provider-internal thinking/signatures.
    This adapter is stateless, so it does not require native continuation contexts.
    """
    def __init__(self,provider):
        self.provider=provider;self.name=provider.name;self.capabilities=provider.capabilities
    def complete(self,messages,max_tokens):
        completion=self.provider.complete(messages,max_tokens)
        return replace(completion,raw={'source':'real-model','internal_payload':'not retained'},response_context=None)

class SeatAPI:
    def __init__(self):
        self.url=os.environ['PARTITION_ENDPOINT']; self.token=os.environ['PARTITION_SEAT_TOKEN']
    def request(self,suffix='',data=None):
        req=urllib.request.Request(self.url+suffix,data=None if data is None else json.dumps(data).encode(),
            headers={'Authorization':'Bearer '+self.token,'Content-Type':'application/json'})
        with urllib.request.urlopen(req,timeout=10) as r: return json.load(r)

class SeatAdapter:
    def __init__(self,api): self.api=api; self.view=None; self.last_result=None; self.log=None
    def capture(self):
        self.view=self.api.request()
        # Trace artifact is a local observation fingerprint, explicitly not a browser screenshot.
        # No peer data, network screenshots or private pixels from another seat are available.
        text=json.dumps({k:self.view[k] for k in ('role','local','notes','shared','pending','paused','complete')},sort_keys=True)
        raw=hashlib.sha256(text.encode()).digest()
        image=np.zeros((120,320,3),np.uint8); image[:]=[25,29,32]
        for i,b in enumerate(raw): image[60:100,i*10:(i+1)*10]=[b,b,b]
        cv2.putText(image,'SEAT TEXT / NOT 3D VISION',(10,30),cv2.FONT_HERSHEY_SIMPLEX,.5,(220,220,220),1)
        return make_frame(cv2.imencode('.png',image)[1].tobytes())
    def type_text(self,text):
        c=json.loads(text)
        if c.get('type') not in {'inspect','share','action','say','accept','decline','cancel'}: raise ValueError('Unsupported seat command')
        self.last_result=self.api.request('/command',c)
        if self.log is not None:
            chunk=self.log.last(lambda r:r['type']=='action_chunk')
            self.log.append({'type':'progress','channel':'partition_command',
                'chunk_id':chunk['chunk_id'] if chunk else None,'receipt':self.last_result.get('receipt')})
        if not self.last_result.get('ok'):
            if self.last_result.get('retryable') is True and self.last_result.get('code') in RECOVERABLE:
                # The input was delivered, the game command was NOT applied. The receipt records waiting.
                # TacticalLoop captures a new observation before deciding again; never replay this command here.
                self.view=self.last_result.get('view')
                return
            raise ValueError(self.last_result.get('message','Action rejected'))
    def key_down(self,key): raise ValueError('Keyboard is not offered to this virtual adapter')
    def key_up(self,key): pass
    def release_all(self): pass
    def held_keys(self): return frozenset()
    def focus(self): pass
    def person_active_since(self,ts): return False

class SeatGame:
    renderer_version='partition-private-text-v1'
    allowed_keys=frozenset(); allowed_actions=frozenset({'type'}); save_dir=None
    def __init__(self,adapter,seat):
        self.adapter=adapter
        self.manifest=Manifest(name='partition-escape-'+seat,edition='one-room-3d',platform='local-browser',host_os='any',
            clock='step',controls=['text'],coordinate_space='virtual seat text; no browser pixel input',checkpoint='none',
            channels=['text'],seats=[{'seat_id':seat,'kind':'agent'}],rule_check={'status':'cleared','note':'Local prototype, fixed engine'})
    def guidance(self): return 'Explore your own side and cooperate through explicit messages.'
    def open_level(self,index):
        if index != 0: raise ValueError('Only one level')
    def blocked(self,frame):
        v=self.adapter.view
        if v['complete']: return False
        return v['paused'] or (os.environ.get('PARTITION_CONTROLLER','script')=='script' and script_command(v) is None)
    def detect_milestone(self,frame):
        return Milestone('both-escaped',0,'platform') if self.adapter.view['complete'] else None
    def poll_milestone(self,frame): return self.detect_milestone(frame)
    def state_text(self,frame):
        v={k:v for k,v in self.adapter.view.items() if k not in {'worker','controllers'}}
        v['last_action_result']=None if self.adapter.last_result is None else {k:self.adapter.last_result.get(k) for k in ('ok','code','retryable','message')}
        return json.dumps(v,ensure_ascii=False)
    def safe_stop(self): self.adapter.release_all()
    def level_count(self): return 1
    def default_action(self): return None
    def undo_action(self): return None
    def restart_action(self): return None
    def fingerprint(self,frame): return frame.digest

def configuration(controller):
    config_path=os.environ.get('PARTITION_MODEL_CONFIG') if controller=='model' else None
    cfg=load_config(Path(config_path or ROOT/'config/example.yaml'))
    if controller=='model':
        if os.environ.get('PARTITION_ALLOW_MODEL')!='1': raise RuntimeError('Real models are disabled')
        if not os.environ.get('PARTITION_PRICE_TABLE'): raise RuntimeError('An explicit price table is required')
        if cfg.budget.usd_cap is None: raise RuntimeError('A finite authorized USD budget is required')
        prices=PriceTable.load(Path(os.environ['PARTITION_PRICE_TABLE']))
    else:
        p=cfg.providers['default'].model_copy(update={'model':'offline-script-stub','price_table_entry':'script-zero'})
        cfg=cfg.model_copy(update={'providers':{'default':p}})
        prices=PriceTable(version='offline-no-network',entries={'script-zero':dict(input_per_m=0,cached_per_m=0,output_per_m=0,image_each=0)})
    actor=cfg.roles['actor']
    updates={'roles':{'actor':actor},'game':'partition-escape','game_server':None,'observation':'text','memory_start':'cold',
        'chunk_length':1,'settle_ms':1,'comparison_arm':None,'actor_mode':'stateless','actor_notebook':False,
        'labels':{'source':controller,'seat':os.environ.get('PARTITION_SEAT','dry-run')}}
    if controller=='script':
        updates['budget']={'usd_cap':cfg.budget.usd_cap,'provider_units_cap':None,'time_cap_s':1800,'steps_cap':100}
    # Revalidate all inherited combinations rather than silently accepting incompatible profiles.
    cfg=type(cfg).model_validate({**cfg.model_dump(),**updates})
    if controller=='model':cfg=bounded_config(cfg)
    return cfg,prices

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--dry-run',action='store_true');args=parser.parse_args()
    controller=os.environ.get('PARTITION_CONTROLLER','script');cfg,prices=configuration(controller)
    if args.dry_run:
        print(json.dumps({'adapter':'TacticalLoop + virtual private text seat','controller':controller,
            'provider_constructed':False,'network_calls':0,'config_valid':True,
            'budget':cfg.budget.model_dump(),'provider_retries':cfg.provider_retries.max,
            'actor_max_tokens':cfg.actor_max_tokens}));return
    api=SeatAPI();adapter=SeatAdapter(api);seat=os.environ['PARTITION_SEAT'];game=SeatGame(adapter,seat)
    root=Path(os.environ['PARTITION_RUN_ROOT']);run=RunDir.create(root,'harness-'+seat);adapter.log=run.log
    model_provider=None
    if controller=='script':provider=ScriptProvider(cfg.providers[cfg.roles['actor'].provider].capabilities)
    else:
        ledger=authorized_ledger(cfg,prices)
        model_provider=SmokeProvider(cfg,prices,ledger)
        provider=NoInternalPayloadProvider(model_provider)
    loop=TacticalLoop(cfg,game,{cfg.roles['actor'].provider:provider},run,OperatorQueue(),Executor(adapter,run.log,settle_ms=1),
        adapter=adapter,price_table=prices,config_hash=config_hash(cfg),actor=SeatActor(run.log,controller),stall=False,blocked_timeout_s=3600,
        per_game=run.path/'isolated-memory')
    stopped=threading.Event();ended=False
    def publish():
        data=replay_data(run,inline_frames=False)
        if model_provider:data['smoke_transport']=model_provider.audit()
        html=public_studio(data,'脚本 stub' if controller=='script' else '真实模型 · public-safe')
        temp=root/'public-studio.tmp';temp.write_text(html);temp.replace(root/'public-studio.html')
        v=api.request();steps=sum(r['type']=='action_chunk' for r in run.log.iter())
        status='complete' if v['complete'] else 'stopped' if ended else 'waiting' if v['paused'] or (controller=='script' and script_command(v) is None) else 'running'
        api.request('/worker',{'status':status,'steps':steps,'runId':run.path.name})
    def monitor():
        while not stopped.wait(1):
            try: publish()
            except (OSError,ValueError): pass  # a read may race the append; retry the next complete snapshot
    reporter=threading.Thread(target=monitor,daemon=True);reporter.start()
    # Use the existing complete session lifecycle, budgets, ownership and trace records.
    def interrupt(signum,frame): raise KeyboardInterrupt
    signal.signal(signal.SIGTERM,interrupt)
    try:
        result=loop.run_session('start',note='Private text-seat adapter; '+('offline script, not a real model.' if controller=='script' else 'authorized single-request real-model smoke; no automatic continuation.'))
        print(json.dumps({'end':result.reason if hasattr(result,'reason') else str(result),'run':str(run.path),'controller':controller}),flush=True)
    finally:
        ended=True;stopped.set();reporter.join(timeout=2);game.safe_stop();publish()
        if model_provider:model_provider.close()

if __name__=='__main__':main()
