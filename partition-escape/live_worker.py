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
def alias(value):return hashlib.sha256(str(value).encode()).hexdigest()[:24]

def slim(view):
    return {k:view.get(k) for k in ('role','local','pending','paused','complete','signals','notes','shared')}|{
      'scene':[{'id':x['id'],'name':x['name'],'actions':x.get('actions',[])} for x in view.get('scene',[])],
      'messages':view.get('messages',[])[-3:]}

SYSTEM=('你是隔墙逃脱游戏的东席搭档，用自然简短中文交流，每次一两句。只知道自己观察和搭档主动分享的信息。'
 '主动查看自己物件、分享发现并合作。工具才会操作机关，说话不是操作成功；先看真实回执再报告结果。'
 '人类的嗯、好或语音不能替代其确认按钮；不能替人类操作。听到等等就等待，不因查看而催促。'
 'inspect的id用scene物件id；action的id必须用scene.actions中列出的动作id，例如递钥匙是send-key，不是hatch。'
 '每次行动使用observe返回的ticket。scope变更后旧ticket无效，要重新observe。只用允许的type和当前物件/提议id。'
 '第一次先用seat_command查看hatch，然后告诉搭档你的发现，等他回应。每次最多自主查看两个物件。'
 '不要输出内部思维，不背诵工具参数，不假装已经听到尚未传来的话。')

TOOLS=[{'function_declarations':[
 {'name':'observe','description':'Read only your own seat and shared messages. Use latest control scope.',
  'behavior':'BLOCKING','parameters':{'type':'OBJECT','properties':{'scope':{'type':'STRING'}},'required':['scope']}},
 {'name':'seat_command','description':'One own-seat action through harness. Shared actions need peer button consent. Never claim success without receipt.',
  'behavior':'BLOCKING','parameters':{'type':'OBJECT','properties':{'ticket':{'type':'STRING'},
   'type':{'type':'STRING','enum':['inspect','share','action','say','accept','decline','cancel']},'id':{'type':'STRING','description':'inspect: scene[].id; action: scene[].actions[].id, e.g. send-key, NEVER object id hatch; share: notes[].id; accept/decline/cancel: pending.id'},'text':{'type':'STRING'}},'required':['ticket','type']}}
]}]

class Session:
    def __init__(self,fixture=False):
        self.fixture=fixture;self.api=SeatAPI();self.root=Path(os.environ['PARTITION_RUN_ROOT']);self.root.mkdir(parents=True,exist_ok=True)
        self.seat=os.environ['PARTITION_SEAT'];self.scope=os.environ['PARTITION_LIVE_SCOPE'];self.epoch=0
        self.ledger=Ledger(self.root/'fixture-ledger' if fixture else None,fixture=fixture)
        self.closed=asyncio.Event();self.session=None;self.reason='closed';self.speaking=False;self.drop_audio=False;self.turn_open=False
        self.calls={};self.canceled=set();self.tool_queue=asyncio.Queue();self.public=[];self.started=time.monotonic()
        self.tool_busy=False;self.updates=ContextUpdates(self)
    def record(self,kind,**fields):
        row={'source':'offline-fixture' if self.fixture else 'gemini-live','kind':kind,'at_ms':round((time.monotonic()-self.started)*1000),'epoch':self.epoch,**fields}
        self.public.append(row)
        data={'model':MODEL,'events':self.public,'audit':self.ledger.row}
        (self.root/'live-public.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
        write_public_index(self.root,data,self.api.url.rsplit('/',1)[-1],self.seat)
    def stop(self,reason):self.reason=reason;self.closed.set();self.updates.cancel()
    async def send_content(self,text,complete=False):
        self.ledger.debit('text_bytes',len(text.encode()))
        if not self.fixture:await self.session.send_client_content(turns={'role':'user','parts':[{'text':text}]},turn_complete=complete)
        if complete:self.turn_open=True
    async def observation(self,scope):
        o=await asyncio.to_thread(self.api.request,'/live-observe',{'scope':scope})
        if o.get('ok'):o['view']=slim(o['view'])
        return o
    async def respond(self,call,result):
        wire=json.dumps(result,ensure_ascii=False);self.ledger.debit('text_bytes',len(wire.encode()))
        if not self.fixture:
            from google.genai import types
            await self.session.send_tool_response(function_responses=[types.FunctionResponse(id=call['id'],name=call['name'],response=result)])
    async def tool_loop(self):
        while not self.closed.is_set():
            call=await self.tool_queue.get();self.tool_busy=True
            try:
                a=alias(call['id']);fingerprint=json.dumps([call['name'],call['args']],sort_keys=True)
                if call['id'] in self.calls:
                    saved=self.calls[call['id']]
                    result=saved[1] if saved[0]==fingerprint else {'ok':False,'code':'duplicate_call_conflict'}
                elif call['id'] in self.canceled or call['epoch']!=self.epoch or self.speaking:
                    result={'ok':False,'code':'live_superseded'}
                else:
                    self.ledger.debit('tools',1)
                    if call['name']=='observe' and set(call['args'])=={'scope'}:result=await self.observation(call['args']['scope'])
                    elif call['name']=='seat_command':
                        args=dict(call['args']);ticket=args.pop('ticket',None)
                        try:
                            validate_command(args)
                            result=await asyncio.to_thread(execute,self.api,self.seat,self.root,a,ticket,args,self.fixture)
                            # Fresh own-seat result stays on the private model channel only.
                            if result.get('view'):result['view']=slim(result['view'])
                            self.record('tool_result',call_alias=a,receipt=result.get('receipt'),harness_run=result.get('harness_run'),harness_chunk=result.get('harness_chunk'),reason_status='not_provided')
                            emit({'type':'tool','callAlias':a,'receipt':result.get('receipt'),'harnessRun':result.get('harness_run'),'harnessChunk':result.get('harness_chunk')})
                        except (ValueError,TypeError):result={'ok':False,'code':'invalid_tool'}
                    else:result={'ok':False,'code':'unknown_tool'}
                    self.calls[call['id']]=(fingerprint,result)
                self.record('tool_response',call_alias=a,tool=call['name'] if call['name'] in ('observe','seat_command') else 'unknown',ok=bool(result.get('ok')),code=result.get('code') or result.get('receipt',{}).get('code'))
                await self.respond(call,result)
            finally:
                self.tool_busy=False;self.tool_queue.task_done();self.updates.wake()
    async def input_loop(self):
        reader=asyncio.StreamReader(limit=30000);protocol=asyncio.StreamReaderProtocol(reader)
        await asyncio.get_running_loop().connect_read_pipe(lambda:protocol,sys.stdin)
        while not self.closed.is_set():
            line=await reader.readline()
            if not line:self.stop('browser_disconnected');return
            b=json.loads(line);kind=b.get('type')
            if kind=='stop':self.stop('user_stop');return
            if kind=='game_update':self.updates.offer(b);continue
            if kind=='start':
                self.updates.cancel()
                self.speaking=True;self.scope=b['scope'];self.epoch=b['epoch'];self.drop_audio=self.turn_open
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
                self.updates.cancel()
                self.scope=b['scope'];self.epoch=b['epoch'];self.drop_audio=self.turn_open;self.turn_open=True
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
                    self.turn_open=True
                    for c in response.tool_call.function_calls or []:
                        await self.tool_queue.put({'id':c.id,'name':c.name,'args':c.args or {},'epoch':self.epoch})
                content=response.server_content
                if not content:continue
                if content.interrupted:
                    self.drop_audio=False;self.record('provider_interrupted');emit({'type':'interrupted','epoch':self.epoch})
                for item in (content.model_turn.parts if content.model_turn else []) or []:
                    if getattr(item,'thought',False):continue
                    if item.inline_data and item.inline_data.mime_type.startswith('audio/pcm'):
                        pcm=item.inline_data.data;self.ledger.debit('output_seconds',len(pcm)/48000);self.turn_open=True
                        if not self.drop_audio and not self.speaking:emit({'type':'audio','data':base64.b64encode(pcm).decode(),'rate':24000,'epoch':self.epoch})
                for attr,who in [('input_transcription','you'),('output_transcription','partner')]:
                    t=getattr(content,attr,None)
                    if t and t.text:emit({'type':'transcript','speaker':who,'text':t.text[:1000],'epoch':self.epoch})
                if content.turn_complete:
                    self.ledger.debit('turns',1);self.turn_open=False;self.drop_audio=False
                    self.record('turn_complete');emit({'type':'turn_complete'});self.updates.wake()
    async def fixture_loop(self,initial):
        emit({'type':'ready','source':'offline-fixture','model':'offline-fixture','seconds':60})
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
                config={'response_modalities':['AUDIO'],'system_instruction':SYSTEM if self.seat=='east' else SYSTEM.replace('东席','西席').replace('hatch','plaque'),'tools':TOOLS,
                  'max_output_tokens':LIMITS['max_output_tokens'],
                  'speech_config':{'voice_config':{'prebuilt_voice_config':{'voice_name':'Aoede'}}},
                  'input_audio_transcription':{},'output_audio_transcription':{},
                  'realtime_input_config':{'automatic_activity_detection':{'disabled':True}}}
                parsed_config=types.LiveConnectConfig(**config)
                client=genai.Client(api_key=key(),http_options={'api_version':'v1beta','timeout':15000})
                self.record('local_preflight_passed')
            self.ledger.reserve();self.record('connection_reserved')
            initial=await self.observation(self.scope)
            if not initial.get('ok'):raise RuntimeError('initial_observation_failed')
            if self.fixture:
                tasks=[asyncio.create_task(self.input_loop()),asyncio.create_task(self.tool_loop()),asyncio.create_task(self.updates.run()),asyncio.create_task(self.fixture_loop(initial))]
                done,_=await asyncio.wait(tasks,timeout=LIMITS['seconds'],return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    if task.exception():raise task.exception()
            else:
                # Count setup/tool text too, and refuse before dialing if over the fixed cap.
                self.ledger.debit('text_bytes',len(json.dumps(config,ensure_ascii=False).encode()))
                async with asyncio.timeout(LIMITS['seconds']):
                    async with client.aio.live.connect(model=MODEL,config=parsed_config) as session:
                        self.session=session;self.record('connected');emit({'type':'ready','source':'gemini-live','model':MODEL,'seconds':60})
                        await self.send_content(json.dumps({'initial_observation':initial,'request':'先查看自己的hatch，再向搭档打个简短招呼。'},ensure_ascii=False),True)
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
            self.closed.set();self.updates.cancel()
            for task in tasks:task.cancel()
            await asyncio.gather(*tasks,return_exceptions=True)
            if client:
                with contextlib.suppress(Exception):await client.aio.aclose()
            self.ledger.finish(self.reason);self.record('closed',reason=self.reason)
            emit({'type':'closed','reason':self.reason,'audit':self.ledger.row});self.ledger.close()

if __name__=='__main__':
    try:asyncio.run(Session(os.environ.get('PARTITION_LIVE_FIXTURE')=='1').run())
    except Exception:emit({'type':'closed','reason':'authorization_or_setup_failed'})
