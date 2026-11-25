"""Audit freshly recorded script reasons against branches, public events and existing TacticalLoop logs.
No provider calls. Pass rooms produced by integration_test.py; public artifacts only.
"""
import argparse,hashlib,json
from pathlib import Path
from harness.run_dir import RunDir
from harness.replay_html import replay_data
from public_trace import public_trace,public_studio,LABELS
from script_policy import provider_decision,POLICY_VERSION
from trace_fixture import fixture
from decision_reasons import HANDOFF_REASONS

def audit(room,root,out):
    paths=[root/room/s/('harness-'+s) for s in ('west','east') if (root/room/s/('harness-'+s)).exists()]
    traces={p.parent.name:replay_data(RunDir.open(p),inline_frames=False) for p in paths}
    events={}
    for data in traces.values():
        for step in data['steps']:
            for e in json.loads(step['observation']['state_text']).get('events',[]): events[e['id']]=e
    result={'room':room,'seats':[],'public_events':[events[i] for i in sorted(events)],'target_coverage':{b:{} for b in sorted(HANDOFF_REASONS)}}
    for path in paths:
        seat=path.parent.name;data=traces[seat];safe=public_trace(data,'脚本 stub');rows=[]
        for i,(raw,pub) in enumerate(zip(data['steps'],safe['steps']),1):
            v=json.loads(raw['observation']['state_text']);chunk=raw.get('chunk') or {}
            if not chunk.get('actions'):continue
            c=json.loads(chunk['actions'][0]['text']);record=json.loads(chunk['commentary'])
            expected=provider_decision(v)
            assert record['kind']=='script_rule' and record['policy_version']==POLICY_VERSION
            assert record['reason_id']==expected.reason_id and c==expected.command,(room,seat,i)
            r=pub['public_reason'];assert r['status'] in ('provided','omitted','unmapped'),r
            # Public audit counts only published IDs; do not reveal a withheld cause via per-room tallies.
            if r['status']=='provided' and expected.reason_id in HANDOFF_REASONS:
                counts=result['target_coverage'][expected.reason_id];counts[r['status']]=counts.get(r['status'],0)+1
            if r['status']=='provided':assert r['reason_id']==record['reason_id']
            else:assert r['reason_id'] is None
            for evidence in r['evidence']:
                if evidence['kind']=='public_action':
                    e=events[evidence['room_event']]
                    assert e['type']=='action' and LABELS[evidence['action']] in e['text'],(room,seat,i,e)
                elif evidence['kind']=='public_event':
                    e=events[evidence['room_event']]
                    assert e['type']==evidence['event_type'] and e['seat']==evidence['seat']
                elif evidence['kind']=='public_signals':
                    assert evidence['revision']==v['rev']
                    for action,seq in evidence['signals'].items():
                        assert seq==v['signals'].get(action,0)
                        if seq:assert events[seq]['type']=='action' and LABELS[action] in events[seq]['text']
                else:assert evidence['kind']=='shared_fact' and any(n['id']==evidence['fact_id'] for n in v['shared'])
            for note in v['notes']:
                if not any(n['id']==note['id'] for n in v['shared']):
                    assert note['text'] not in json.dumps(pub,ensure_ascii=False)
            rows.append({'step':i,'branch_matches_record':True,'reason':r,'execution':pub['public_execution'],
                         'receipt':pub['public_receipt'],'chunk_id':chunk['chunk_id'],
                         'calls':[{'request_id':c.get('request_id'),'harness_seq':c.get('seq')} for c in pub['calls']]})
        name=room+'-'+seat+'.html';(out/name).write_text(public_studio(data,'脚本 stub'))
        records=[json.loads(s) for s in (path/'events.jsonl').read_text().splitlines()]
        ends=[e.get('reason') for e in records if e.get('type')=='session' and e.get('kind')=='end']
        result['seats'].append({'seat':seat,'html':name,'steps':rows,
            'private_log_sha256':hashlib.sha256((path/'events.jsonl').read_bytes()).hexdigest(),'terminal_reasons':ends})
    return result

def main():
    p=argparse.ArgumentParser();p.add_argument('--room',action='append',required=True);p.add_argument('--out',type=Path,required=True)
    p.add_argument('--runs',type=Path,default=Path(__file__).parent/'.runs');a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
    results=[audit(room,a.runs,a.out) for room in a.room]
    f=fixture()
    for name,source in [('fixture.html','离线 fixture · 非真实模型'),('unverified.html','unknown source')]:
        html=public_studio(f,source);assert 'PRIVATE_FIXTURE_SENTINEL' not in html;(a.out/name).write_text(html)
    report={'runs':results,'fixture':'offline model-summary path, NOT real model','model_calls':0,
            'note':'Actual recorded reasons checked at original observations. Public explanation is gated separately; omitted IDs remain withheld.'}
    (a.out/'audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'rooms':len(results),'steps':sum(len(s['steps']) for r in results for s in r['seats']),
                      'matches':True,'model_calls':0}))
if __name__=='__main__':main()
