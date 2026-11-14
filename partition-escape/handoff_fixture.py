"""Synthetic branch-publication cases; never a game session or a real model call."""
import copy,json
from pathlib import Path
from test_handoff_reasons import examples
from test_reasons import trace
from script_policy import provider_decision
from public_trace import public_studio,public_trace
def fixture():
    cases=[]
    for name,v in examples().items():cases.append((name+' supported',v,'provided'))
    v=copy.deepcopy(examples()['offer_key_ready']);v['shared']=[]
    cases.append(('key fact not shared',v,'omitted'))
    v=copy.deepcopy(examples()['accept_key_missing']);v['events']=[]
    cases.append(('proposal event missing',v,'omitted'))
    v=copy.deepcopy(examples()['power_closed_unheld']);v.pop('rev')
    cases.append(('public snapshot missing',v,'omitted'))
    v=copy.deepcopy(examples()['decline_local_safety']);v['signals']['hold-brake']=2
    cases.append(('public safety contradicts local branch',v,'omitted'))
    raw={'header':{'run_id':'offline-handoff-fixture'},'steps':[],'events':[]}
    for i,(name,v,status) in enumerate(cases):
        d=provider_decision(v);step=trace(v,d.record())['steps'][0]
        step['observation'].update(observation_id='o'+str(i),seq=3*i+1)
        step['chunk'].update(chunk_id='c'+str(i),seq=3*i+3)
        step['calls'][0].update(request_id='r'+str(i),seq=3*i+2)
        raw['steps'].append(step)
    safe=public_trace(raw,'脚本 stub')
    for (_,_,status),step in zip(cases,safe['steps']):assert step['public_reason']['status']==status
    html=public_studio(raw,'脚本 stub')
    assert 'PRIVATE_HANDOFF_SENTINEL' not in html
    html=html.replace('<body>','<body><p style="padding:16px;background:#ffe6a7;color:#17202a;font-size:18px">离线脚本分支 fixture · 非真实对局 · 未调用模型：4个支持例与4个缺证据/矛盾例</p>',1)
    return html,[{'step':i+1,'case':name,'expected':status} for i,(name,_,status) in enumerate(cases)]
if __name__=='__main__':
    import sys
    out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True);html,cases=fixture()
    (out/'handoff-fixture.html').write_text(html)
    (out/'handoff-fixture.json').write_text(json.dumps({'kind':'offline synthetic fixture','cases':cases,'model_calls':0},indent=2)+'\n')
