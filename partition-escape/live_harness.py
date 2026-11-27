"""One complete Live tool call -> existing TacticalLoop -> existing seat command API.

There is no second inference here. Each tool has a separate harness run and trace;
the native Live session owns conversation memory, not a parallel strategy model.
"""
import json
from pathlib import Path
from harness.config import config_hash
from harness.core.executor import Executor
from harness.core.loop import TacticalLoop
from harness.core.operator import OperatorQueue
from harness.providers import Completion,ProviderError
from harness.run_dir import RunDir
from harness.replay_html import replay_data
from seat_worker import configuration,SeatActor,SeatAdapter,SeatGame
from seat_protocol import command as validate_command
from public_trace import public_studio

class ToolAdapter(SeatAdapter):
    def __init__(self,api,ticket):super().__init__(api);self.ticket=ticket
    def type_text(self,text):
        c=validate_command(json.loads(text))
        self.last_result=self.api.request('/live-command',{'ticket':self.ticket,'command':c})
        if self.log:
            chunk=self.log.last(lambda r:r['type']=='action_chunk')
            self.log.append({'type':'progress','channel':'partition_command','chunk_id':chunk['chunk_id'] if chunk else None,'receipt':self.last_result.get('receipt')})
        # Delivered input != applied game action. All engine rejections retain their
        # receipt; a rejected tool is returned to Live rather than killing the session.

class ToolProvider:
    name='live-tool-bridge-no-new-inference'
    def __init__(self,c,capabilities):self.c=c;self.capabilities=capabilities;self.used=False
    def complete(self,messages,max_tokens):
        if self.used:raise ProviderError('Tool already consumed',retryable=False)
        self.used=True
        return Completion(text=json.dumps(self.c),input_tokens=0,output_tokens=0,cached_tokens=0,latency_ms=0,
                          raw={'source':'live-tool-dispatch','additional_provider_requests':0})

def execute(api,seat,root,call_alias,ticket,c,fixture=False):
    validate_command(c)
    cfg,prices=configuration('script')
    cfg=cfg.model_copy(update={'budget':cfg.budget.model_copy(update={'steps_cap':1,'time_cap_s':5}),
        'provider_retries':cfg.provider_retries.model_copy(update={'max':0})})
    adapter=ToolAdapter(api,ticket);game=SeatGame(adapter,seat)
    run=RunDir.create(Path(root),'tool-'+call_alias);adapter.log=run.log
    provider=ToolProvider(c,cfg.providers[cfg.roles['actor'].provider].capabilities)
    loop=TacticalLoop(cfg,game,{cfg.roles['actor'].provider:provider},run,OperatorQueue(),
        Executor(adapter,run.log,settle_ms=1),adapter=adapter,price_table=prices,config_hash=config_hash(cfg),
        actor=SeatActor(run.log,'offline-fixture' if fixture else 'model'),stall=False,blocked_timeout_s=2)
    try:loop.run_session('start',note='Live tool dispatch through harness; billing belongs to the separate Live session ledger.')
    finally:
        data=replay_data(run,inline_frames=False)
        source='离线 fixture · 非真实模型' if fixture else '真实模型 · public-safe'
        page=tool_page(data,source)
        Path(root,'public-studio.html').write_text(page)
        (run.path/'public-studio.html').write_text(page)
    result=adapter.last_result or {'ok':False,'code':'harness_aborted','message':'工具在发送前被 harness 中止。'}
    chunk=run.log.last(lambda r:r['type']=='action_chunk')
    return {k:result.get(k) for k in ('ok','code','message','receipt')}|{'harness_run':run.path.name,
        'harness_chunk':chunk.get('chunk_id') if chunk else None,'view':result.get('view'),'ticket':result.get('ticket')}

def tool_page(data,source):
    page=public_studio(data,source).replace('<body>', '<body><p style="padding:16px;background:#242c34;color:white">Gemini Live 工具执行 · 此 harness 步不另发推理请求；费用见 Live 会话账本。未提供可公开决策说明，语音不是内部思维。</p>')
    page=page.replace("$('cost').textContent=money(calls.reduce((sum,c)=>sum+(c.cost_usd || 0),0))", "$('cost').textContent='见 Live 会话账本'").replace('provider responses','工具桥接记录，非额外推理')
    return page
