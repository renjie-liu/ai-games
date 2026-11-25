"""Offline HTTP + real harness session smoke test. Human actions here are API test drivers, not a user study."""
import json, os, subprocess, sys, time, urllib.request, urllib.error
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
ROOT=Path(__file__).resolve().parent
PORT=os.environ.get('PARTITION_TEST_PORT','4186')
BASE='http://127.0.0.1:'+PORT
def req(path,token=None,data=None):
    h={'Content-Type':'application/json'}
    if token:h['Authorization']='Bearer '+token
    r=urllib.request.Request(BASE+path,headers=h,data=None if data is None else json.dumps(data).encode())
    with urllib.request.urlopen(r,timeout=10) as f:return json.load(f)
def denied(path,token=None,data=None,status=403):
    try:req(path,token,data)
    except urllib.error.HTTPError as e:assert e.code==status,(path,e.code);return
    raise AssertionError('request unexpectedly allowed: '+path)
def tokens(d):return {s:parse_qs(urlsplit(link).fragment)['key'][0] for s,link in d['links'].items() if link}

env={**os.environ,'PORT':PORT,'PARTITION_PYTHON':sys.executable,'PARTITION_STEP_DELAY':'0.03'}
env.pop('PARTITION_ALLOW_MODEL',None)
server=subprocess.Popen(['node','server3d.mjs'],cwd=ROOT,env=env,stdout=subprocess.DEVNULL)
try:
    for _ in range(80):
        try:
            urllib.request.urlopen(BASE,timeout=1).close();break
        except OSError:time.sleep(.1)
    denied('/api/rooms',data={'controllers':{'west':'human','east':'model'}})
    for w,e in [('human','human'),('human','script'),('script','human'),('script','script')]:
        d=req('/api/rooms',data={'controllers':{'west':w,'east':e}}); t=tokens(d);p='/api/rooms/'+d['id']
        denied(p);denied(p+'/command',t['watch'],{'type':'action','id':'power-on'})
        denied('/world.mjs',status=404);denied('/engine.mjs',status=404)
        if w=='human':
            req(p+'/command',t['west'],{'type':'inspect','id':'plaque'})
            denied(p+'/studio?seat=east',t['west'])
        if e=='human':
            ev=req(p,t['east']);assert 'interlock' not in json.dumps(ev)
            req(p+'/command',t['east'],{'type':'inspect','id':'brake'})
        for s in ['west','east']:
            if s in t:
                v=req(p,t[s])
                for obj in v['scene']:req(p+'/command',t[s],{'type':'inspect','id':obj['id']})
                for note in req(p,t[s])['notes']:req(p+'/command',t[s],{'type':'share','id':note['id']})
        started=time.monotonic();recovered_early_release=False
        while time.monotonic()-started<45:
            public=req(p,t['watch'])
            assert not public['scene'] and not public['notes'] and 'local' not in public
            if public['complete']:break
            assert not any(v.get('status')=='error' for v in public['worker'].values()), public['worker']
            for s in ['west','east']:
                if s not in t:continue
                v=req(p,t[s]);l=v['local'];c=None
                pending=v['pending']
                if pending:
                    if pending['from']!=s:
                        c={'type':'accept','id':pending['id']}
                elif s=='east':
                    action='send-key' if l['keyHere'] else 'hold-brake' if l['gateOpen'] and not l['holdingBrake'] and not l['braced'] else 'brace' if l['holdingBrake'] and not l['fanSpinning'] and not l['braced'] else 'release-brake' if l['holdingBrake'] and l['braced'] else 'leave' if l['braced'] and public['public']['doorOpen'] else None
                    if w=='script' and action=='brace' and not recovered_early_release:
                        action='release-brake';recovered_early_release=True
                    if action:c={'type':'action','id':action}
                else:
                    actions='\n'.join(x['text'] for x in v['events'] if x['type']=='action')
                    action='unlock' if l['keyHere'] and not l['unlocked'] else 'power-on' if not l['power'] and '拉住手闸' not in actions else 'power-off' if l['power'] and '拉住手闸' in actions else 'open-door' if l['unlocked'] and not l['doorOpen'] and '松开手闸' in actions else None
                    if action:c={'type':'action','id':action}
                if c:
                    r=req(p+'/command',t[s],c);assert r['ok'],r.get('message')
            time.sleep(.06)
        else:raise AssertionError(('no completion',w,e,public))
        time.sleep(1.5)
        for s,controller in [('west',w),('east',e)]:
            if controller!='script':continue
            path=ROOT/'.runs'/d['id']/s/('harness-'+s)/'events.jsonl'
            records=[json.loads(x) for x in path.read_text().splitlines()]
            kinds=[r['type'] for r in records]
            assert all(k in kinds for k in ['run_header','session','observation','inference_request','model_call','action_result','milestone'])
            assert any(r['type']=='session' and r['kind']=='end' and r['reason']=='levels_done' for r in records)
            # No opponent private clue until explicitly shared. Network-only capability is the sole observation source.
            studio=(ROOT/'.runs'/d['id']/s/'public-studio.html').read_text()
            assert 'Private seat observation withheld' in studio
        print(json.dumps({'mode':w+'+'+e,'complete':True,'room':d['id'],'private_views_checked':True}),flush=True)
    print('PASS: four combinations, HTTP permissions, real offline harness sessions and Trace artifacts; no model calls.')
finally:
    server.terminate();server.wait(timeout=10)
