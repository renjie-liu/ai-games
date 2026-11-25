"""Explicit one-request real smoke. Do NOT run during review/offline regression.

The east seat is a labelled API test driver. It shares its key fact and proposes a
handoff before the west model's first observation. The model chooses its own reply.
This can verify one cooperation exchange, not a whole puzzle or autonomous exploration.
"""
import argparse
import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from harness.replay_html import replay_data
from harness.run_dir import RunDir
from model_smoke import authorized_ledger, identity, transport_audit
from public_trace import public_trace, public_studio
from seat_worker import configuration

ROOT=Path(__file__).resolve().parent


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--output',type=Path,required=True)
    ap.add_argument('--execute-one',action='store_true',help='Spend at most one request; requires separate user authorization')
    args=ap.parse_args()
    if not args.execute_one:raise SystemExit('No model call: pass --execute-one only after explicit authorization')
    cfg,prices=configuration('model')
    ledger=authorized_ledger(cfg,prices).path  # before mkdir/server/provider; currently exhausted
    out=args.output.resolve();out.mkdir(parents=True,exist_ok=False)
    gate=out/'start';launcher=out/'python-gated'
    # Runner-only barrier: no provider construction until the test driver has staged
    # a real pending proposal through the ordinary authorized action API.
    launcher.write_text('#!'+sys.executable+'\nimport os,sys,time\nfrom pathlib import Path\n'
        +'deadline=time.monotonic()+120\n'
        +f'while not Path({str(gate)!r}).exists():\n'
        +' if time.monotonic()>deadline:sys.exit(2)\n time.sleep(.02)\n'
        +'os.execv(sys.executable,[sys.executable,*sys.argv[1:]])\n')
    launcher.chmod(0o700)
    with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
    base=f'http://127.0.0.1:{port}'
    def req(path,token=None,data=None):
        headers={'Content-Type':'application/json'}
        if token:headers['Authorization']='Bearer '+token
        r=urllib.request.Request(base+path,headers=headers,data=None if data is None else json.dumps(data).encode())
        with urllib.request.urlopen(r,timeout=10) as f:return json.load(f)
    env={**os.environ,'PORT':str(port),'PARTITION_PYTHON':str(launcher),'PARTITION_MODEL_LEDGER':str(ledger)}
    with (out/'server.log').open('w') as log:
        server=subprocess.Popen(['node','server3d.mjs'],cwd=ROOT,env=env,stdout=log,stderr=log)
        try:
            for _ in range(100):
                try:urllib.request.urlopen(base,timeout=.2).close();break
                except OSError:time.sleep(.05)
            d=req('/api/rooms',data={'controllers':{'west':'model','east':'human'}})
            tokens={s:parse_qs(urlsplit(link).fragment)['key'][0] for s,link in d['links'].items() if link}
            p='/api/rooms/'+d['id'];driver=[]
            for c in [{'type':'inspect','id':'hatch'},{'type':'share','id':'key-found'},
                      {'type':'action','id':'send-key'}]:
                r=req(p+'/command',tokens['east'],c)
                if not r['ok']:raise RuntimeError('Test driver setup rejected; no model call')
                driver.append(r['receipt'])
            before=req(p,tokens['watch'])
            if not before['pending'] or before['pending']['action']!='send-key':
                raise RuntimeError('Expected pending handoff; no model call')
            authorized_ledger(cfg,prices);gate.write_text('ready')
            runroot=ROOT/'.runs'/d['id']/'west';runpath=runroot/'harness-west'
            deadline=time.monotonic()+cfg.budget.time_cap_s+15;records=[]
            while time.monotonic()<deadline:
                events=runpath/'events.jsonl'
                if events.exists():
                    try:records=[json.loads(x) for x in events.read_text().splitlines()]
                    except json.JSONDecodeError:time.sleep(.05);continue
                    if any(r.get('type')=='session' and r.get('kind')=='end' for r in records):break
                worker=req(p,tokens['watch'])['worker'].get('west',{})
                if worker.get('status')=='error':raise RuntimeError('Worker stopped; inspect local log, do not retry')
                time.sleep(.1)
            else:raise RuntimeError('Smoke timed out; no restart/retry; billing may be incomplete')
            after=req(p,tokens['watch'])
            # Reuse exactly the production public projection; never export prompts/raw
            # observations, provider internal payload, key/token headers or credentials.
            data=replay_data(RunDir.open(runpath),inline_frames=False)
            data['smoke_transport']=transport_audit(json.loads(ledger.read_text()))
            safe=public_trace(data,'真实模型 · public-safe')
            (out/'public-studio.html').write_text(public_studio(data,'真实模型 · public-safe'))
            calls=[r for r in records if r.get('type')=='model_call']
            end=next(r for r in reversed(records) if r.get('type')=='session' and r.get('kind')=='end')
            report={'kind':'real Google request; NOT fixture','controller':'west model; east API test driver',
                **identity(cfg,prices),'harness_config_budget':cfg.budget.model_dump(),
                'room_id':d['id'],'driver_receipts':driver,'before':before,'after':after,
                'ledger':json.loads(ledger.read_text()),'public_trace':safe,
                'session_end':{k:end[k] for k in ('seq','ts','reason','cause') if k in end},
                'model_call_records':len(calls),'cooperation_handoff_applied':bool(after['signals'].get('send-key')),
                'complete':after['complete'],'no_automatic_continuation':True}
            (out/'smoke-evidence.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
            print(json.dumps({k:report[k] for k in ('room_id','ledger','session_end','model_call_records','cooperation_handoff_applied','complete')},ensure_ascii=False))
        finally:
            server.terminate();server.wait(timeout=10)


if __name__=='__main__':main()
