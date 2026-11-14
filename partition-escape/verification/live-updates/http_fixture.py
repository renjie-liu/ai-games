"""Loopback-only fixture: actual server, worker, harness and engine; no SDK/mic.
Uses a temporary game copy. Only fixture_loop/send capture are instrumented;
production routing, queue, budget, input_loop and tool_loop remain unchanged.
"""
import argparse,hashlib,json,os,shutil,socket,subprocess,sys,tempfile,threading,time,urllib.request,urllib.error
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--output',required=True);a=p.parse_args();OUT=Path(a.output).resolve();OUT.mkdir(parents=True,exist_ok=True)
fixture='''
# Test-only provider script, not a real model response.
async def update_test_fixture(self,initial):
    assert self.fixture
    original=self.send_content
    async def capture(text,complete=False):
        await original(text,complete)
        if 'game_state_update' in text:
            with (self.root/'context-wires.jsonl').open('a') as f:f.write(json.dumps({'text':text,'turn_complete':complete},ensure_ascii=False)+'\\n')
    self.send_content=capture
    emit({'type':'ready','source':'offline-fixture','model':'offline-fixture','seconds':60})
    await self.tool_queue.put({'id':'fixture-key','name':'seat_command','args':{'type':'action','id':'send-key','ticket':initial['ticket']},'epoch':0})
    await self.tool_queue.join()
    await self.closed.wait()
Session.fixture_loop=update_test_fixture
'''
with tempfile.TemporaryDirectory(prefix='live-state-',dir=OUT.parent) as temp:
    root=Path(temp)/'game';shutil.copytree(ROOT,root,ignore=shutil.ignore_patterns('.runs','.live','.model','.voice','__pycache__','verification','node_modules'))
    script=root/'live_worker.py';s=script.read_text();script.write_text(s.replace("if __name__=='__main__':",fixture+"\nif __name__=='__main__':"))
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    base=f'http://127.0.0.1:{port}';env={k:v for k,v in os.environ.items() if not any(t in k.upper() for t in ('API_KEY','PROXY','PARTITION_MODEL','PARTITION_LIVE','PARTITION_TTS'))}
    env.update(PORT=str(port),PARTITION_ALLOW_LIVE='1',PARTITION_LIVE_FIXTURE='1',PARTITION_ALLOW_MODEL='0',PARTITION_TTS_MODE='off',PARTITION_PYTHON=sys.executable)
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    def req(path,token=None,data=None,stream=False):
        h={'Content-Type':'application/json','Origin':base}
        if token:h['Authorization']='Bearer '+token
        f=opener.open(urllib.request.Request(base+path,headers=h,data=None if data is None else json.dumps(data).encode()),timeout=10)
        if stream:return f
        with f:return json.load(f)
    def wait_for(fn,seconds=8):
        until=time.monotonic()+seconds
        while time.monotonic()<until:
            result=fn()
            if result:return result
            time.sleep(.03)
        raise AssertionError('fixture deadline')
    server=subprocess.Popen(['node','server3d.mjs'],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        def health():
            try:return req('/api/health')
            except OSError:return None
        wait_for(health);results=[]
        for mode in ('delivery','pause-before-flush','speech-before-flush','stop-before-flush'):
            room=req('/api/rooms',data={'controllers':{'west':'human','east':'live'}})
            token=parse_qs(urlsplit(room['links']['west']).fragment)['key'][0];path='/api/rooms/'+room['id']
            stream=req(path+'/live-stream',token,stream=True);stream_events=[]
            def read_stream():
                try:
                    for line in stream:
                        event=json.loads(line);stream_events.append(event)
                        if event['type']=='closed':break
                except OSError:pass
            thread=threading.Thread(target=read_stream,daemon=True);thread.start();req(path+'/live-start',token,{'fixture':True})
            state=wait_for(lambda:req(path,token).get('pending'))
            wait_for(lambda:any(e['type']=='tool' for e in stream_events))
            receipt=req(path+'/command',token,{'type':'accept','id':state['id']})['receipt']
            assert receipt['outcome']=='applied'
            run=root/'.runs'/room['id']/'east';wirefile=run/'context-wires.jsonl'
            if mode=='delivery':
                req(path+'/command',token,{'type':'inspect','id':'power'}) # remains private
                req(path+'/command',token,{'type':'inspect','id':'plaque'})
                clue=req(path+'/command',token,{'type':'share','id':'interlock'})['receipt']
                wait_for(lambda:wirefile.exists())
                first=wirefile.read_text();rows=[json.loads(x) for x in first.splitlines()]
                assert len(rows)==1 and rows[0]['turn_complete'] is False
                payload=json.loads(rows[0]['text'])['game_state_update'];ids=[e['id'] for e in payload['events']]
                assert ids==receipt['roomEventIds']+clue['roomEventIds'],(ids,receipt,clue)
                assert '不能分别供电' not in first and token not in first and 'local' not in payload
                for _ in range(4):req(path+'/command',token,{'type':'share','id':'interlock'})
                # A timer regression cannot hide behind the 250ms coalescing window.
                time.sleep(2.1);assert wirefile.read_text()==first
                req(path+'/live-input',token,{'type':'stop'})
                public_rows=[]
                for row in rows:
                    content=json.loads(row['text']);content['control_scope']='<fixture-scope-redacted>'
                    public_rows.append({'text':json.dumps(content,ensure_ascii=False),'turn_complete':row['turn_complete']})
                (OUT/'delivered-context.json').write_text(json.dumps(public_rows,ensure_ascii=False,indent=2))
            elif mode=='pause-before-flush':req(path+'/command',token,{'type':'pause'})
            elif mode=='speech-before-flush':
                req(path+'/live-input',token,{'type':'start'});time.sleep(.35);req(path+'/live-input',token,{'type':'stop'})
            else:req(path+'/live-input',token,{'type':'stop'})
            wait_for(lambda:any(e['type']=='closed' for e in stream_events));time.sleep(.15)
            if mode!='delivery':assert not wirefile.exists()
            public=json.loads((run/'live-public.json').read_text());assert public['audit']['usage']==[]
            assert all(e['source']=='offline-fixture' for e in public['events'])
            (OUT/f'{mode}.json').write_text(json.dumps(public,ensure_ascii=False,indent=2))
            shutil.copyfile(run/'live-studio.html',OUT/f'{mode}.html')
            results.append({'case':mode,'source':'offline-fixture','realModelRequests':0,'engineOutcome':receipt['outcome'],'roomEventIds':receipt['roomEventIds'],'requestId':receipt['requestId'],'contextSends':sum(e.get('status')=='fixture_sent' for e in public['events']),'ledgerTextBytes':public['audit']['text_bytes'],'passed':True})
            thread.join(timeout=2);stream.close()
        (OUT/'results.json').write_text(json.dumps({'source':'offline-fixture; temporary test-only provider script','cases':results},indent=2));print(json.dumps(results,indent=2))
    finally:
        server.terminate()
        try:server.wait(timeout=8)
        except subprocess.TimeoutExpired:server.kill();server.wait()
