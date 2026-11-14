"""Deterministic TOCTOU reproduction + repeated real offline dual TacticalLoop sessions.

Only local servers; fresh port per batch; no model controller. Results include failures, never retry away failures.
"""
import argparse, concurrent.futures, json, os, socket, subprocess, sys, threading, time, urllib.request
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import parse_qs,urlsplit
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parent)
parser.add_argument('--out',type=Path,required=True);parser.add_argument('--cases',type=int,default=10);parser.add_argument('--repeats',type=int,default=30)
args=parser.parse_args();root=args.root.resolve();args.out.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(root))
from seat_worker import SeatAdapter
from harness.actions import Chunk,Type
from harness.core.executor import Executor
from harness.log.events import EventLog

@contextmanager
def server(delay):
    with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
    base='http://127.0.0.1:'+str(port)
    env={**os.environ,'PORT':str(port),'PARTITION_PYTHON':sys.executable,'PARTITION_STEP_DELAY':str(delay),'PARTITION_ALLOW_MODEL':'0'}
    with (args.out/('server-'+str(port)+'.log')).open('w') as log:
        p=subprocess.Popen(['node','server3d.mjs'],cwd=root,env=env,stdout=log,stderr=log)
        try:
            for _ in range(100):
                if p.poll() is not None:raise RuntimeError('test server exited')
                try:urllib.request.urlopen(base,timeout=.2).close();break
                except OSError:time.sleep(.05)
            else:raise TimeoutError('server startup')
            yield base
        finally:p.terminate();p.wait(timeout=15)

class API:
    def __init__(self,base,room,token):self.url=base+'/api/rooms/'+room;self.token=token
    def request(self,suffix='',data=None):
        r=urllib.request.Request(self.url+suffix,headers={'Authorization':'Bearer '+self.token,'Content-Type':'application/json'},data=None if data is None else json.dumps(data).encode())
        with urllib.request.urlopen(r,timeout=10) as f:return json.load(f)
def create(base,w,e):
    r=urllib.request.Request(base+'/api/rooms',data=json.dumps({'controllers':{'west':w,'east':e}}).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(r) as f:d=json.load(f)
    return d,{s:API(base,d['id'],parse_qs(urlsplit(link).fragment)['key'][0]) for s,link in d['links'].items() if link}
def command(api,id):return api.request('/command',{'type':'action','id':id})

def deterministic(base,index):
    d,apis=create(base,'human','human');winner='west' if index%2==0 else 'east';loser='east' if winner=='west' else 'west'
    assert command(apis['west'],'power-on')['ok'];assert command(apis['east'],'hold-brake')['ok']
    barrier=threading.Barrier(2);first_done=threading.Event();adapters={};out={}
    def task(seat):
        adapter=SeatAdapter(apis[seat]);adapters[seat]=adapter;adapter.capture()
        logdir=args.out/f'case-{index}'/seat;logdir.mkdir(parents=True)
        log=EventLog(logdir/'events.jsonl');log.append({'type':'run_header','source':'deterministic real Executor test; no provider'})
        adapter.log=log
        action='power-off' if seat=='west' else 'send-key'
        chunk=Chunk(f'case-{index}-{seat}','same-pre-proposal-observation',None,(Type(json.dumps({'type':'action','id':action})),),'deterministic concurrency test')
        barrier.wait(timeout=5)
        if seat==loser:assert first_done.wait(5)
        try:
            results=Executor(adapter,log,settle_ms=1).execute(chunk)
            out[seat]={'transport_results':[r.status for r in results], 'game_ok':adapter.last_result['ok'],
                       'code':adapter.last_result.get('code'),'receipt':adapter.last_result.get('receipt')}
        finally:
            if seat==winner:first_done.set()
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        futures=[pool.submit(task,s) for s in ('west','east')]
        for f in futures:f.result(timeout=15)
    assert out[winner]['game_ok'] and not out[loser]['game_ok'],out
    assert out[loser]['code']=='proposal_pending',out
    # Loser refreshes its own observation and confirms winner; it must not replay the old action automatically.
    adapters[loser].capture();p=adapters[loser].view['pending']
    adapters[loser].type_text(json.dumps({'type':'accept','id':p['id']}));assert adapters[loser].last_result['ok']
    # The other proposal can now be issued and confirmed with the same adapters, proving continuation.
    adapters[loser].type_text(json.dumps({'type':'action','id':'power-off' if loser=='west' else 'send-key'}))
    assert adapters[loser].last_result['ok'];p=apis[loser].request()['pending']
    adapters[winner].type_text(json.dumps({'type':'accept','id':p['id']}));assert adapters[winner].last_result['ok']
    return {'case':index,'room':d['id'],'winner':winner,'success':True,'outcomes':out,'continued_after_conflict':True}

def repeat(base,index,delay):
    d,apis=create(base,'script','script');start=time.monotonic();v=None
    while time.monotonic()-start<50:
        v=apis['watch'].request()
        if any(w.get('status')=='error' for w in v['worker'].values()):raise AssertionError(('worker_error',d['id']))
        if v['complete'] and len(v['worker'])==2 and all(w.get('status')=='complete' for w in v['worker'].values()):break
        time.sleep(.1)
    else:raise AssertionError(('timeout',d['id']))
    paths={};summaries={}
    for seat in ('west','east'):
        path=root/'.runs'/d['id']/seat/('harness-'+seat)/'events.jsonl';paths[seat]=str(path)
        # A complete game may be reported before session-end is flushed. Check the actual lifecycle record.
        for _ in range(100):
            records=[json.loads(x) for x in path.read_text().splitlines() if x.strip()]
            ends=[x for x in records if x['type']=='session' and x['kind']=='end']
            if ends:break
            time.sleep(.05)
        assert ends and ends[-1]['reason']=='levels_done',(d['id'],seat,ends)
        assert not any(x['type']=='session' and x.get('reason')=='error' for x in records)
        receipts=[x['receipt'] for x in records if x['type']=='progress' and x.get('channel')=='partition_command']
        summaries[seat]={'end':ends[-1]['reason'],'calls':sum(x['type']=='model_call' for x in records),
            'waiting_conflicts':sum(r.get('outcome')=='waiting' for r in receipts),
            'rejected_commands':sum(r.get('outcome')=='rejected' for r in receipts)}
    return {'case':index,'room':d['id'],'delay':delay,'success':True,'elapsed_s':round(time.monotonic()-start,2),'sessions':summaries,'log_paths':paths}

results={'deterministic':[],'dual_script':[],'model_calls':0,'note':'provider events are script stub; no real model. Failures retained, no automatic retries.'}
with server(.03) as base:
    for i in range(args.cases):
        try:r=deterministic(base,i)
        except Exception as e:r={'case':i,'success':False,'error':str(e)}
        results['deterministic'].append(r);print(json.dumps({'kind':'deterministic',**r},ensure_ascii=False),flush=True)
for batch in range((args.repeats+9)//10):
    delay=[.01,.03,.08][batch%3]
    with server(delay) as base:
        for i in range(batch*10,min(args.repeats,(batch+1)*10)):
            try:r=repeat(base,i,delay)
            except Exception as e:r={'case':i,'success':False,'error':str(e)}
            results['dual_script'].append(r);print(json.dumps({'kind':'dual_script',**r},ensure_ascii=False),flush=True)
results['counts']={k:{'success':sum(x['success'] for x in results[k]),'failure':sum(not x['success'] for x in results[k])} for k in ('deterministic','dual_script')}
(args.out/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n');print(json.dumps(results['counts']),flush=True)
sys.exit(1 if any(c['failure'] for c in results['counts'].values()) else 0)
