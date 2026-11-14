"""Real offline TacticalLoop probe: human API driver proposes stop before east holds the brake."""
import json,os,socket,subprocess,sys,time,urllib.request
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
ROOT=Path(__file__).resolve().parent
with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
BASE='http://127.0.0.1:'+str(port)
def req(path,token=None,data=None):
    headers={'Content-Type':'application/json'}
    if token:headers['Authorization']='Bearer '+token
    r=urllib.request.Request(BASE+path,headers=headers,data=None if data is None else json.dumps(data).encode())
    with urllib.request.urlopen(r,timeout=10) as f:return json.load(f)
env={**os.environ,'PORT':str(port),'PARTITION_ALLOW_MODEL':'0','PARTITION_PYTHON':sys.executable,'PARTITION_STEP_DELAY':'0.35'}
server=subprocess.Popen(['node','server3d.mjs'],cwd=ROOT,env=env,stdout=subprocess.DEVNULL)
try:
    for _ in range(100):
        try:urllib.request.urlopen(BASE,timeout=.2).close();break
        except OSError:time.sleep(.05)
    d=req('/api/rooms',data={'controllers':{'west':'human','east':'script'}})
    token={s:parse_qs(urlsplit(link).fragment)['key'][0] for s,link in d['links'].items() if link}
    path='/api/rooms/'+d['id']
    def command(c):
        r=req(path+'/command',token['west'],c);assert r['ok'],r.get('message');return r
    command({'type':'inspect','id':'plaque'})
    command({'type':'action','id':'power-on'})
    command({'type':'action','id':'power-off'})
    start=time.monotonic();declined=None
    while time.monotonic()-start<15:
        public=req(path,token['watch'])
        declined=next((e for e in public['events'] if e.get('resolution')=='decline' and e.get('proposal')=='power-off'),None)
        if declined:break
        assert not any(x.get('status')=='error' for x in public['worker'].values()),public['worker']
        time.sleep(.05)
    assert declined,'early power-off was not declined'
    # Preserve a real observable refusal, then finish through the same public commands.
    for obj in req(path,token['west'])['scene']:command({'type':'inspect','id':obj['id']})
    for note in req(path,token['west'])['notes']:command({'type':'share','id':note['id']})
    start=time.monotonic()
    while time.monotonic()-start<45:
        public=req(path,token['watch'])
        if public['complete']:break
        assert not any(x.get('status')=='error' for x in public['worker'].values()),public['worker']
        v=req(path,token['west']);local=v['local'];s=v['signals'];pending=v['pending']
        if pending:
            if pending['from']=='east':command({'type':'accept','id':pending['id']})
        else:
            held=s.get('hold-brake',0)>s.get('release-brake',0)
            action='unlock' if local['keyHere'] and not local['unlocked'] else 'power-off' if local['power'] and held else 'open-door' if s.get('brace') and not held and local['unlocked'] and not local['doorOpen'] else None
            if action:command({'type':'action','id':action})
        time.sleep(.06)
    else:raise AssertionError('room did not finish')
    log=ROOT/'.runs'/d['id']/'east/harness-east/events.jsonl'
    for _ in range(100):
        rows=[json.loads(x) for x in log.read_text().splitlines()]
        if any(r.get('type')=='session' and r.get('kind')=='end' and r.get('reason')=='levels_done' for r in rows):break
        time.sleep(.05)
    else:raise AssertionError('worker has not ended')
    print(json.dumps({'room':d['id'],'complete':True,'decline_event':declined['id'],
        'mode':'human API driver + real offline script harness','forced_early_stop':True,'model_calls':0}))
finally:
    server.terminate();server.wait(timeout=10)
