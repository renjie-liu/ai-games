"""Bounded native Gemini Live session. PCM fixture mode never constructs an SDK client."""
import asyncio
import base64
import contextlib
import hashlib
import json
import os
from pathlib import Path
import sys
import time
from live_budget import Ledger,LIMITS,MODEL,key
from live_harness import execute
from live_trace import write as write_public_index
from live_updates import ContextUpdates
from seat_worker import SeatAPI
from seat_protocol import command as validate_command
from live_runtime import check as check_runtime, diagnostic

def emit(row):os.write(1,(json.dumps(row,ensure_ascii=False)+'\n').encode())
# Only server-owned lifecycle codes cross the pipe; never reflect arbitrary stop text.
NODE_STOP_REASONS=frozenset(('user_stop','tab_hidden','game_paused','client_heartbeat_lost','browser_disconnected',
    'session_deadline','client_backpressure','uplink_backpressure','worker_overflow','worker_pipe_closed'))
def node_stop_reason(value):
    return value if isinstance(value,str) and value in NODE_STOP_REASONS else 'server_stop_unknown'

def alias(value):return hashlib.sha256(str(value).encode()).hexdigest()[:24]

# Text held before any tool runs, so an executed command's receipt always fits the fixed session cap.
RECEIPT_RESERVE_BYTES=1024
OUTCOMES=('proposed','applied','recorded','rejected','waiting')
def text(value,n):return value[:n] if isinstance(value,str) else None
def token(value,n):return value if isinstance(value,str) and 0<len(value)<=n and all(c.isalnum() or c in '_-' for c in value) else None
def compact_receipt(result):
    """Bounded receipt-only response used when the full response no longer fits; view omitted, IDs kept."""
    r=result.get('receipt') if isinstance(result.get('receipt'),dict) else {}
    receipt={'requestId':token(r.get('requestId'),32),'command':text(r.get('command'),20),
      'outcome':r.get('outcome') if r.get('outcome') in OUTCOMES else None,'code':token(r.get('code'),40),
      'roomEventIds':[i for i in r.get('roomEventIds') if type(i) is int and 0<=i<10**6][:12] if isinstance(r.get('roomEventIds'),list) else [],
      'changes':{k:v for k,v in r.get('changes').items() if k in ('doorOpen','gateOpen','power','escaped') and type(v) is bool} if isinstance(r.get('changes'),dict) else {},
      'proposalId':token(r.get('proposalId'),32)}
    out={'ok':result.get('ok') is True,'code':token(result.get('code'),40),'message':text(result.get('message'),60),'receipt':receipt,
      'harness_run':token(result.get('harness_run'),80),'harness_chunk':token(result.get('harness_chunk'),80),
      'view_omitted':'text_budget','next':'observe before any further action'}
    if len(json.dumps(out,ensure_ascii=False).encode())>RECEIPT_RESERVE_BYTES:
        out={'ok':out['ok'],'code':out['code'],'receipt':{k:receipt[k] for k in ('requestId','outcome','roomEventIds')},'view_omitted':'text_budget'}
    return out

def slim(view):
    return {k:view.get(k) for k in ('role','local','pending','paused','complete','signals','notes','shared')}|{
      'scene':[{'id':x['id'],'name':x['name'],'actions':x.get('actions',[])} for x in view.get('scene',[])],
      'messages':view.get('messages',[])[-3:]}

SYSTEM=('你是隔墙逃脱游戏的东席搭档，用自然简短中文交流，每次一两句。只知道自己观察和搭档主动分享的信息。'
 '主动查看自己物件、分享发现并合作。工具才会操作机关，说话不是操作成功；先看真实回执再报告结果。'
 '人类的嗯、好或语音不能替代其确认按钮；不能替人类操作。听到等等就等待，不因查看而催促。'
 'inspect的id用scene物件id；action的id必须用scene.actions中列出的动作id，例如递钥匙是send-key，不是hatch。'
 '每次行动使用observe返回的ticket。scope变更后旧ticket无效，要重新observe。只用允许的type和当前物件/提议id。'
 '开场先听搭档说话。能直接回答的问题用语音简短回答；需要探索时主动观察并操作自己的物件，再用语音报告结果。每次最多自主查看两个物件。'
 '不要输出内部思维，不背诵工具参数，不假装已经听到尚未传来的话。')

TOOLS=[{'function_declarations':[
 {'name':'observe','description':'Read only your own seat and shared messages. Use latest control scope.',
  'behavior':'BLOCKING','parameters':{'type':'OBJECT','properties':{'scope':{'type':'STRING'}},'required':['scope']}},
 {'name':'seat_command','description':'One own-seat action through harness. Shared actions need peer button consent. Never claim success without receipt.',
  'behavior':'BLOCKING','parameters':{'type':'OBJECT','properties':{'ticket':{'type':'STRING'},
   'type':{'type':'STRING','enum':['inspect','share','action','say','accept','decline','cancel']},'id':{'type':'STRING','description':'inspect: scene[].id; action: scene[].actions[].id, e.g. send-key, NEVER object id hatch; share: notes[].id; accept/decline/cancel: pending.id'},'text':{'type':'STRING'}},'required':['ticket','type']}}
]}]

def live_config(seat):
    # Same dict in fixture and real mode, so fixture runs debit the same setup text as a real session.
    return {'response_modalities':['AUDIO'],'system_instruction':SYSTEM if seat=='east' else SYSTEM.replace('东席','西席').replace('hatch','plaque'),'tools':TOOLS,
      'max_output_tokens':LIMITS['max_output_tokens'],
      'speech_config':{'voice_config':{'prebuilt_voice_config':{'voice_name':'Aoede'}}},
      'input_audio_transcription':{},'output_audio_transcription':{},
      'realtime_input_config':{'automatic_activity_detection':{'disabled':True}}}
def initial_text(initial):
    return json.dumps({'initial_observation':initial},ensure_ascii=False)

class Session:
    def __init__(self,fixture=False):
        self.fixture=fixture;self.api=SeatAPI();self.root=Path(os.environ['PARTITION_RUN_ROOT']);self.root.mkdir(parents=True,exist_ok=True)
        self.seat=os.environ['PARTITION_SEAT'];self.scope=os.environ['PARTITION_LIVE_SCOPE'];self.epoch=0
        self.ledger=Ledger(self.root/'fixture-ledger' if fixture else None,fixture=fixture)
        self.closed=asyncio.Event();self.session=None;self.reason='closed';self.speaking=False;self.drop_audio=False;self.turn_open=False;self.generating=False
        self.calls={};self.canceled=set();self.tool_queue=asyncio.Queue();self.public=[];self.started=time.monotonic()
        self.tool_busy=False;self.updates=ContextUpdates(self)
    def record(self,kind,**fields):
        row={'source':'offline-fixture' if self.fixture else 'gemini-live','kind':kind,'at_ms':round((time.monotonic()-self.started)*1000),'epoch':self.epoch,**fields}
        self.public.append(row)
        data={'model':MODEL,'events':self.public,'audit':self.ledger.row}
        target=self.root/'live-public.json'
        temporary=target.with_suffix('.json.tmp')
        temporary.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
        temporary.replace(target)
        write_public_index(self.root,data,self.api.url.rsplit('/',1)[-1],self.seat)
        if kind=='context_update':
            emit({'type':'context_update',**{k:row.get(k) for k in ('stage','status','reason','sequences','room_event_ids')}})
    def stop(self,reason):
        if self.closed.is_set():return
        self.reason=reason;self.closed.set();self.updates.cancel(reason)
    async def send_content(self,text,complete=False):
        self.ledger.debit('text_bytes',len(text.encode()))
        if not self.fixture:await self.session.send_client_content(turns={'role':'user','parts':[{'text':text}]},turn_complete=complete)
        if complete:self.turn_open=True
    async def observation(self,scope):
        o=await asyncio.to_thread(self.api.request,'/live-observe',{'scope':scope})
        if o.get('ok'):o['view']=slim(o['view'])
        return o
    def tool_record(self,a,tool,result,execution,delivery,reason,form=None,size=None):
        # Execution (engine side) and receipt delivery (model side) are separate facts; never merge them.
        self.record('tool_response',call_alias=a,tool=tool,ok=bool(result.get('ok')) if result else False,
          code=(result or {}).get('code') or ((result or {}).get('receipt') or {}).get('code'),
          execution=execution,delivery=delivery,reason=reason,response_form=form,response_bytes=size)
    async def respond(self,call,result,a,tool,execution,held=0):
        if held:self.ledger.release_text(held)
        wire=json.dumps(result,ensure_ascii=False);form='full'
        if held and tool=='seat_command' and len(wire.encode())>self.ledger.available('text_bytes'):
            # Within the held reserve: keep the receipt and IDs, drop the view (observe again before acting).
            # A read-only observe is never truncated: without its view a ticket would invite blind actions.
            result=compact_receipt(result);wire=json.dumps(result,ensure_ascii=False);form='compact_receipt'
        size=len(wire.encode())
        if self.closed.is_set() or size>self.ledger.available('text_bytes'):
            reason='session_closed' if self.closed.is_set() else 'text_budget_limit'
            self.tool_record(a,tool,result,execution,'not_sent',reason,form,size)
            if reason=='session_closed':return
            raise RuntimeError('live_text_bytes_limit')
        self.ledger.debit('text_bytes',size)
        try:
            if not self.fixture:
                from google.genai import types
                await self.session.send_tool_response(function_responses=[types.FunctionResponse(id=call['id'],name=call['name'],response=result)])
        except BaseException:
            # A begun transport send cannot be recalled; never retry or refund.
            self.tool_record(a,tool,result,execution,'delivery_unknown_no_retry','send_failed_or_canceled',form,size);raise
        self.tool_record(a,tool,result,execution,'fixture_sent' if self.fixture else 'transport_sent','transport_return_only',form,size)
    async def run_command(self,a,ticket,args):
        job=asyncio.ensure_future(asyncio.to_thread(execute,self.api,self.seat,self.root,a,ticket,args,self.fixture))
        try:return await asyncio.shield(job),None
        except asyncio.CancelledError:
            # Session closing mid-call: the engine call cannot be recalled. Record its receipt, never send it.
            with contextlib.suppress(BaseException):
                result=await asyncio.wait_for(asyncio.shield(job),12)
                return result,'canceled'
            return {'ok':False,'code':'live_outcome_unknown'},'canceled'
    def tool_result_record(self,a,result):
        if result.get('view'):result['view']=slim(result['view'])
        self.record('tool_result',call_alias=a,receipt=result.get('receipt'),harness_run=result.get('harness_run'),harness_chunk=result.get('harness_chunk'),reason_status='not_provided')
        emit({'type':'tool','callAlias':a,'receipt':result.get('receipt'),'harnessRun':result.get('harness_run'),'harnessChunk':result.get('harness_chunk')})
    async def tool_loop(self):
        while not self.closed.is_set():
            call=await self.tool_queue.get();self.tool_busy=True
            try:
                a=alias(call['id']);fingerprint=json.dumps([call['name'],call['args']],sort_keys=True)
                tool=call['name'] if call['name'] in ('observe','seat_command') else 'unknown'
                held=0;execution='not_executed'
                if call['id'] in self.calls:
                    saved=self.calls[call['id']]
                    result=saved[1] if saved[0]==fingerprint else {'ok':False,'code':'duplicate_call_conflict'}
                    execution='not_executed_duplicate'
                elif call['id'] in self.canceled or call['epoch']!=self.epoch or self.speaking or self.closed.is_set():
                    result={'ok':False,'code':'live_superseded'}
                else:
                    # Gate before any room access: one tool slot and a receipt reserve, or nothing runs.
                    gate='live_tools_limit' if self.ledger.available('tools')<1 else 'live_text_bytes_limit' if self.ledger.available('text_bytes')<RECEIPT_RESERVE_BYTES else None
                    if gate:
                        self.tool_record(a,tool,None,'not_executed','not_sent',gate+'_before_execution');raise RuntimeError(gate)
                    self.ledger.debit('tools',1);self.ledger.hold_text(RECEIPT_RESERVE_BYTES);held=RECEIPT_RESERVE_BYTES
                    if tool=='observe' and set(call['args'])=={'scope'}:
                        result=await self.observation(call['args']['scope']);execution='read_only'
                    elif tool=='seat_command':
                        args=dict(call['args']);ticket=args.pop('ticket',None)
                        try:validate_command(args)
                        except (ValueError,TypeError):result={'ok':False,'code':'invalid_tool'}
                        else:
                            try:result,late=await self.run_command(a,ticket,args)
                            except Exception:result,late={'ok':False,'code':'live_outcome_unknown','message':'工具结果未知，请重新观察后再行动。'},None
                            execution='engine_receipt' if result.get('receipt') else 'outcome_unknown' if result.get('code')=='live_outcome_unknown' else 'harness_aborted'
                            # Fresh own-seat result stays on the private model channel only.
                            self.tool_result_record(a,result)
                            if late:
                                self.ledger.release_text(held);self.tool_record(a,tool,result,execution,'not_sent','session_closed');raise asyncio.CancelledError
                    else:result={'ok':False,'code':'unknown_tool'}
                    self.calls[call['id']]=(fingerprint,result)
                await self.respond(call,result,a,tool,execution,held)
            finally:
                self.tool_busy=False;self.tool_queue.task_done();self.updates.wake()
    def interrupt_reply(self):
        # The player cut in. Only a reply that is being spoken right now has audio still on its way,
        # and the provider ends that reply with `interrupted` or `turn_complete`. A turn that is
        # merely awaited (the player paused and went on, or typed) has nothing to drop: muting on
        # that would silence the very reply the player is waiting for.
        self.drop_audio=self.generating
    async def input_loop(self):
        reader=asyncio.StreamReader(limit=30000);protocol=asyncio.StreamReaderProtocol(reader)
        await asyncio.get_running_loop().connect_read_pipe(lambda:protocol,sys.stdin)
        while not self.closed.is_set():
            line=await reader.readline()
            if not line:self.stop('browser_disconnected');return
            b=json.loads(line);kind=b.get('type')
            if kind=='stop':self.stop(node_stop_reason(b.get('reason')));return
            if kind=='game_update':self.updates.offer(b);continue
            if kind=='start':
                self.speaking=True;self.scope=b['scope'];self.epoch=b['epoch'];self.interrupt_reply()
                self.updates.rebind()
                self.record('interrupted',trigger='local_voice');emit({'type':'interrupted','epoch':self.epoch})
                if not self.fixture:await self.session.send_realtime_input(activity_start={})
            elif kind=='end':
                self.speaking=False;self.turn_open=True
                await self.send_content('Control scope '+self.scope+'. Previous tickets are invalid. Use observe if you need a current observation.',False)
                if not self.fixture:await self.session.send_realtime_input(activity_end={})
                self.turn_open=True
            elif kind=='audio':
                audio=base64.b64decode(b['data'],validate=True)
                if len(audio)%2 or len(audio)>6400:raise ValueError('invalid_pcm')
                self.ledger.debit('input_seconds',len(audio)/32000)
                if not self.fixture:
                    from google.genai import types
                    await self.session.send_realtime_input(audio=types.Blob(data=audio,mime_type='audio/pcm;rate=16000'))
            elif kind=='text':
                self.scope=b['scope'];self.epoch=b['epoch'];self.interrupt_reply();self.turn_open=True
                self.updates.rebind()
                await self.send_content(json.dumps({'player_message':b['text'],'control_scope':self.scope},ensure_ascii=False),True)
    async def receive_loop(self):
        while not self.closed.is_set():
            async for response in self.session.receive():
                if response.usage_metadata:
                    u=response.usage_metadata.model_dump(exclude_none=True,mode='json');self.ledger.usage(u)
                    self.record('usage_received');emit({'type':'usage','estimatedUsd':self.ledger.row['estimated_usd']})
                if response.go_away:self.stop('provider_go_away_no_reconnect');return
                if response.tool_call_cancellation:
                    self.canceled.update(response.tool_call_cancellation.ids or [])
                if response.tool_call:
                    self.turn_open=True;self.generating=False # waiting for the tool: no audio is on its way
                    for c in response.tool_call.function_calls or []:
                        await self.tool_queue.put({'id':c.id,'name':c.name,'args':c.args or {},'epoch':self.epoch})
                content=response.server_content
                if not content:continue
                if content.interrupted:
                    self.drop_audio=False;self.generating=False;self.record('provider_interrupted');emit({'type':'interrupted','epoch':self.epoch})
                for item in (content.model_turn.parts if content.model_turn else []) or []:
                    if getattr(item,'thought',False):continue
                    if item.inline_data and item.inline_data.mime_type.startswith('audio/pcm'):
                        pcm=item.inline_data.data;self.ledger.debit('output_seconds',len(pcm)/48000);self.turn_open=True;self.generating=True
                        if not self.drop_audio and not self.speaking:emit({'type':'audio','data':base64.b64encode(pcm).decode(),'rate':24000,'epoch':self.epoch})
                for attr,who in [('input_transcription','you'),('output_transcription','partner')]:
                    t=getattr(content,attr,None)
                    if t and t.text:emit({'type':'transcript','speaker':who,'text':t.text[:1000],'epoch':self.epoch})
                if content.turn_complete:
                    self.ledger.debit('turns',1);self.turn_open=False;self.drop_audio=False;self.generating=False
                    self.record('turn_complete');emit({'type':'turn_complete'});self.updates.wake()
    async def fixture_loop(self,initial):
        emit({'type':'ready','source':'offline-fixture','model':'offline-fixture','seconds':LIMITS['seconds']})
        # Artificial PCM tone, never a synthesized voice or environmental recording.
        import math,struct
        pcm=b''.join(struct.pack('<h',int(1500*math.sin(i*2*math.pi*440/24000))) for i in range(4800))
        emit({'type':'audio','data':base64.b64encode(pcm).decode(),'rate':24000,'epoch':0})
        await self.tool_queue.put({'id':'fixture-inspect','name':'seat_command','args':{'type':'inspect','id':'hatch','ticket':initial['ticket']},'epoch':0})
        await self.closed.wait()
    async def run(self):
        tasks=[];client=None
        try:
            if not self.fixture:
                check_runtime() # No credentials or network, before reserving any quota.
                from google import genai
                from google.genai import types
                config=live_config(self.seat)
                parsed_config=types.LiveConnectConfig(**config)
                client=genai.Client(api_key=key(),http_options={'api_version':'v1beta','timeout':15000})
                self.record('local_preflight_passed')
            self.ledger.reserve();self.record('connection_reserved')
            initial=await self.observation(self.scope)
            if not initial.get('ok'):raise RuntimeError('initial_observation_failed')
            if self.fixture:
                # Debit the same setup and initial-observation text a real session sends (no transport here).
                self.ledger.debit('text_bytes',len(json.dumps(live_config(self.seat),ensure_ascii=False).encode()))
                self.ledger.debit('text_bytes',len(initial_text(initial).encode()))
                tasks=[asyncio.create_task(self.input_loop()),asyncio.create_task(self.tool_loop()),asyncio.create_task(self.updates.run()),asyncio.create_task(self.fixture_loop(initial))]
                done,_=await asyncio.wait(tasks,timeout=LIMITS['seconds'],return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    if task.exception():raise task.exception()
            else:
                # Count setup/tool text too, and refuse before dialing if over the fixed cap.
                self.ledger.debit('text_bytes',len(json.dumps(config,ensure_ascii=False).encode()))
                async with asyncio.timeout(LIMITS['seconds']):
                    async with client.aio.live.connect(model=MODEL,config=parsed_config) as session:
                        if session.setup_complete is None:
                            raise RuntimeError('live_setup_unacknowledged')
                        self.session=session
                        self.record('connected')
                        # Seed context without opening a model turn. The player can speak first.
                        await self.send_content(initial_text(initial),complete=False)
                        emit({'type':'ready','source':'gemini-live','model':MODEL,'seconds':LIMITS['seconds']})
                        tasks=[asyncio.create_task(self.input_loop()),asyncio.create_task(self.tool_loop()),asyncio.create_task(self.updates.run()),asyncio.create_task(self.receive_loop())]
                        done,_=await asyncio.wait([*tasks,asyncio.create_task(self.closed.wait())],return_when=asyncio.FIRST_COMPLETED)
                        for task in done:
                            if not task.cancelled() and task.exception():raise task.exception()
        except TimeoutError:self.reason='session_deadline'
        except Exception as error:
            # Never serialize SDK exceptions/URLs/headers or API response bodies.
            known=str(error) if isinstance(error,RuntimeError) and str(error).startswith(('live_','initial_','gemini_key')) else type(error).__name__
            self.reason=diagnostic(error) or known[:100]
            numeric=getattr(error,'code',None) or getattr(getattr(error,'rcvd',None),'code',None)
            self.record('provider_or_runtime_error',error_class=type(error).__name__,diagnostic_code=diagnostic(error),numeric_code=numeric if isinstance(numeric,int) else None)
        finally:
            self.closed.set();self.updates.cancel(self.reason)
            for task in tasks:task.cancel()
            await asyncio.gather(*tasks,return_exceptions=True)
            if client:
                with contextlib.suppress(Exception):await client.aio.aclose()
            self.ledger.finish(self.reason);self.record('closed',reason=self.reason)
            emit({'type':'closed','reason':self.reason,'audit':self.ledger.row});self.ledger.close()

if __name__=='__main__':
    try:asyncio.run(Session(os.environ.get('PARTITION_LIVE_FIXTURE')=='1').run())
    except Exception:emit({'type':'closed','reason':'authorization_or_setup_failed'})
