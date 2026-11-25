"""Loopback fixture verification. --real is explicit, once only, no reconnect.
No microphone: input is optional generated PCM fixture, never an ambient recording.
"""
import argparse,base64,json,queue,threading,time
from pathlib import Path
import httpx

def check(origin,out,real=False,pcm=None):
    out=Path(out);out.mkdir(parents=True,exist_ok=True)
    client=httpx.Client(base_url=origin,timeout=10,trust_env=False,headers={'Origin':origin})
    room=client.post('/api/rooms',json={'controllers':{'west':'human','east':'live'}}).json()
    token=room['links']['west'].split('key=')[1];headers={'Authorization':'Bearer '+token}
    path='/api/rooms/'+room['id'];events=[];q=queue.Queue();ready=threading.Event();stop=threading.Event()
    def read():
        try:
            with httpx.stream('GET',origin+path+'/live-stream',headers=headers,timeout=70,trust_env=False) as r:
                r.raise_for_status();ready.set()
                for line in r.iter_lines():
                    if not line:continue
                    event=json.loads(line);q.put(event)
                    if event['type']=='closed':break
        except Exception as e:q.put({'type':'reader_error','class':type(e).__name__})
    thread=threading.Thread(target=read,daemon=True);thread.start();assert ready.wait(5)
    def post(s,b):
        r=client.post(path+'/live-'+s,json=b,headers=headers);r.raise_for_status();return r.json()
    # No audio or session before start. The fixture flag cannot be used on production launcher.
    before=client.get(path,headers=headers).json()
    post('start',{'fixture':not real});start=time.monotonic();sent=False;closed=False
    lastbeat=0;audio_bytes=0;transcripts=[];confirmed=False
    while time.monotonic()-start<58:
        if time.monotonic()-lastbeat>1:
            try:post('input',{'type':'heartbeat'})
            except httpx.HTTPStatusError:pass
            lastbeat=time.monotonic()
        try:e=q.get(timeout=.1)
        except queue.Empty:continue
        if e['type']=='audio':
            raw=base64.b64decode(e['data']);audio_bytes+=len(raw)
            with (out/'output.pcm').open('ab') as f:f.write(raw)
            e={k:v for k,v in e.items() if k!='data'}|{'pcm_bytes':len(raw)}
        if e['type']=='transcript':transcripts.append(e)
        events.append(e)
        if e['type']=='closed':closed=True;break
        if e['type']=='reader_error':break
        if real and e['type']=='tool' and e.get('receipt',{}).get('outcome')=='proposed' and not confirmed:
            current=client.get(path,headers=headers).json();pending=current.get('pending')
            if pending and pending['action']=='send-key':
                response=client.post(path+'/command',json={'type':'accept','id':pending['id']},headers=headers).json()
                events.append({'type':'test_driver_button','source':'explicit-test-driver-not-human-study','receipt':response.get('receipt')});confirmed=True
                client.post(path+'/command',json={'type':'say','text':'我已按按钮接收钥匙。谢谢。'},headers=headers).raise_for_status()
        # A real partner waits for the player. The scripted fixture opens with a tool.
        if e['type']==('ready' if real else 'tool') and not sent:
            sent=True
            if pcm:
                data=Path(pcm).read_bytes();post('input',{'type':'start'})
                for i in range(0,len(data),1600):
                    post('input',{'type':'audio','data':base64.b64encode(data[i:i+1600]).decode()});time.sleep(.05)
                post('input',{'type':'end'})
            elif not real:
                post('input',{'type':'start'});post('input',{'type':'audio','data':base64.b64encode(b'\0'*1600).decode()});post('input',{'type':'end'})
                post('input',{'type':'stop'})
        if real and sent and time.monotonic()-start>25:
            try:post('input',{'type':'stop'})
            except httpx.HTTPStatusError:pass
    if not closed:
        try:post('input',{'type':'stop'})
        except httpx.HTTPStatusError:pass
    thread.join(4)
    while not q.empty():events.append(q.get_nowait())
    after=client.get(path,headers=headers).json()
    # Only public view, command receipts and deliberately spoken transcription.
    watch_token=room['links']['watch'].split('key=')[1]
    public=client.get(path,headers={'Authorization':'Bearer '+watch_token}).json()
    studio=client.get(path+'/studio?seat=east',headers={'Authorization':'Bearer '+watch_token})
    if studio.status_code==200:(out/'studio.html').write_text(studio.text)
    result={'source':'real-live-with-synthetic-audio' if real else 'offline-fixture','room':room['id'],
       'microphone_captured':False,'before_rev':before['rev'],'after_rev':after['rev'],'output_pcm_bytes':audio_bytes,
       'events':events,'public':public,'elapsed_s':round(time.monotonic()-start,2)}
    (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print(json.dumps({'room':room['id'],'source':result['source'],'before_rev':before['rev'],'after_rev':after['rev'],
        'event_types':[e['type'] for e in events], 'audio_bytes':audio_bytes,'close':[e.get('reason') for e in events if e['type']=='closed']},ensure_ascii=False))
    return result
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--origin',default='http://127.0.0.1:4182');p.add_argument('--out',required=True);p.add_argument('--real',action='store_true');p.add_argument('--pcm');a=p.parse_args()
    check(a.origin,a.out,a.real,a.pcm)
