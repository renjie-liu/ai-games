"""Offline HTTP + real harness session smoke test. Human actions here are API test drivers, not a user study."""
import json, os, re, subprocess, sys, time, urllib.request, urllib.error
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
# Two people get the whole room: a battery and a choice of supports. Each test driver uses only its
# own view. East offers the supports that fit its slot, in order; west decides each by its table,
# its gate's weight and the tag colour east shared. A room with a script in it has one brace.
def supports_offered(v):return {re.fullmatch(r'装上刻着(.+)的支撑',a['label']).group(1):a['id'] for o in v['scene'] for a in o['actions'] if a['id'].startswith('brace-')}
def east_offer(v):
    notes=' '.join(n['text'] for n in v['notes'])
    if '刻着' not in notes:return {'type':'inspect','id':'fan'}
    low,high=map(int,re.search(r'只放得进 (\d+) 到 (\d+) 厘米',notes).groups())
    turned_down={e['proposal'] for e in v['events'] if e.get('resolution')=='decline'}
    fitting=[mark for mark,cm in re.findall(r'刻着(.+?)的长 (\d+) 厘米',notes) if low<=int(cm)<=high]
    return {'type':'action','id':next(a for mark,a in supports_offered(v).items() if mark in fitting and a not in turned_down)}
def west_agrees(v,pending):
    if not pending['action'].startswith('brace-'):return True
    notes={n['object']:n for n in v['notes']}
    weight=int(re.search(r'自重 (\d+) 公斤',notes['plaque']['text']).group(1))
    tag=re.search(r'一块(.+?)色检修牌',' '.join(n['text'] for n in v['shared'])).group(1)
    table=notes['chart']['table'];mark=re.fullmatch(r'装上刻着(.+)的支撑',pending['label']).group(1)
    return next(row for row in table['rows'] if row[0]==mark)[table['columns'].index(tag+'牌')]>=weight

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
        # People get the room with the choice of supports; a script in either seat means the mechanisms alone.
        if w=='human':
            assert ('chart' in [o['id'] for o in req(p,t['west'])['scene']])==(e=='human')
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
                        c={'type':'accept' if s=='east' or west_agrees(v,pending) else 'decline','id':pending['id']}
                elif s=='east':
                    action='send-key' if l['keyHere'] else 'hold-brake' if l['gateOpen'] and not l['holdingBrake'] and not l['braced'] else 'brace' if l['holdingBrake'] and not l['fanSpinning'] and not l['braced'] else 'release-brake' if l['holdingBrake'] and l['braced'] else 'leave' if l['braced'] and public['public']['doorOpen'] else None
                    if w=='script' and action=='brace' and not recovered_early_release:
                        action='release-brake';recovered_early_release=True
                    if action:c={'type':'action','id':action}
                    if action=='brace' and supports_offered(v):c=east_offer(v)
                else:
                    actions='\n'.join(x['text'] for x in v['events'] if x['type']=='action')
                    action='unlock' if l['keyHere'] and not l['unlocked'] else 'power-on' if not l['power'] and '拉住手闸' not in actions else 'power-off' if l['power'] and '拉住手闸' in actions else 'open-door' if l['unlocked'] and not l['doorOpen'] and '松开手闸' in actions else None
                    if action:c={'type':'action','id':action}
                if c:
                    r=req(p+'/command',t[s],c);assert r['ok'],r.get('message')
            time.sleep(.06)
        else:raise AssertionError(('no completion',w,e,public))
        # Only the room two people play is rated, and the table's pick costs one cell and no pack.
        assert public.get('rating')==({'stars':3,'powerOns':1,'packs':0} if (w,e)==('human','human') else None),public.get('rating')
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
